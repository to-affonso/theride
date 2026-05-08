'use client';

// Minimal Web Serial API types (full types via @types/w3c-web-serial)
interface WebSerialNavigator extends Navigator {
  serial: {
    requestPort(opts?: { filters?: Array<{ usbVendorId: number; usbProductId?: number }> }): Promise<WebSerialPort>;
  };
}
interface WebSerialPort {
  open(opts: { baudRate: number; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
}

const SYNC        = 0xA4;
const NET_KEY     = [0xB9, 0xA5, 0x21, 0xFB, 0xBD, 0x72, 0xC3, 0x45];
const RF_FREQ     = 57; // 2457 MHz

// ANT+ message IDs
const MSG_RESET      = 0x4A;
const MSG_NET_KEY    = 0x46;
const MSG_ASSIGN_CH  = 0x42;
const MSG_SET_CH_ID  = 0x51;
const MSG_SET_PERIOD = 0x43;
const MSG_SET_FREQ   = 0x45;
const MSG_OPEN_CH    = 0x4B;
const MSG_BROADCAST  = 0x4E;

// Channel → [deviceType, period]
const CHANNEL_DEFS: [number, number][] = [
  [0x78, 8070], // 0: HR
  [0x0B, 8182], // 1: Cycling Power
  [0x79, 8086], // 2: Speed & Cadence
  [0x11, 8192], // 3: FE-C (smart trainer)
];

export type AntChannelName   = 'hr' | 'power' | 'csc' | 'fec';
export type AntChannelStatus = 'idle' | 'searching' | 'found';

const CH_NAMES: AntChannelName[] = ['hr', 'power', 'csc', 'fec'];

export interface AntCallbacks {
  onHR:            (bpm: number) => void;
  onPower:         (watts: number, cadence?: number) => void;
  onCSC:           (cadence: number) => void;
  onFEC:           (watts: number, cadence?: number) => void;
  onChannelUpdate: (ch: AntChannelName, status: AntChannelStatus) => void;
  onLog:           (msg: string, type: 'info' | 'success' | 'warn' | 'error') => void;
  onConnect:       (dongleName: string) => void;
  onDisconnect:    () => void;
}

export class AntEngine {
  private cb: AntCallbacks;
  private port: WebSerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buf: number[] = [];
  // CSC delta state
  private cscPrev = { rev: 0, time: 0, init: false };

  constructor(cb: AntCallbacks) {
    this.cb = cb;
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async connect(): Promise<void> {
    const nav = navigator as WebSerialNavigator;
    try {
      this.port = await nav.serial.requestPort({
        filters: [
          { usbVendorId: 0x0FCF, usbProductId: 0x1008 }, // Garmin USB-2
          { usbVendorId: 0x0FCF, usbProductId: 0x1009 }, // SUUNTO Movestick Mini
        ],
      });
    } catch {
      this.cb.onLog('Seleção de dongle ANT+ cancelada.', 'warn');
      return;
    }

    try {
      await this.port.open({ baudRate: 57600, bufferSize: 4096 });
    } catch (err) {
      this.cb.onLog(`Erro ao abrir porta serial: ${(err as Error).message}`, 'error');
      this.port = null;
      return;
    }

    this.writer = this.port.writable!.getWriter();
    this.cb.onConnect('ANT+ USB Dongle');
    this.cb.onLog('Dongle conectado. Configurando canais...', 'success');

    await this.setupChannels();
    this.startReadLoop();
  }

  async disconnect(): Promise<void> {
    this.writer?.releaseLock();
    this.writer = null;
    try { await this.port?.close(); } catch { /* ignore */ }
    this.port = null;
    this.cb.onDisconnect();
    this.cb.onLog('Dongle ANT+ desconectado.', 'warn');
  }

  // Build an ANT+ message: SYNC | LEN | MSG_ID | ...data | XOR checksum
  private buildMsg(msgId: number, data: number[]): Uint8Array {
    let chk = data.length ^ msgId;
    for (const b of data) chk ^= b;
    return new Uint8Array([SYNC, data.length, msgId, ...data, chk]);
  }

  private async send(msgId: number, data: number[]): Promise<void> {
    if (!this.writer) return;
    await this.writer.write(this.buildMsg(msgId, data));
    await new Promise(r => setTimeout(r, 50));
  }

  private async setupChannels(): Promise<void> {
    await this.send(MSG_RESET, [0x00]);
    await new Promise(r => setTimeout(r, 500));

    // Network 0, public ANT+ key
    await this.send(MSG_NET_KEY, [0x00, ...NET_KEY]);

    for (let ch = 0; ch < CHANNEL_DEFS.length; ch++) {
      const [devType, period] = CHANNEL_DEFS[ch];
      await this.send(MSG_ASSIGN_CH,  [ch, 0x00, 0x00]);                              // slave, net 0
      await this.send(MSG_SET_CH_ID,  [ch, 0x00, 0x00, devType, 0x00]);              // wildcard device
      await this.send(MSG_SET_PERIOD, [ch, period & 0xFF, (period >> 8) & 0xFF]);
      await this.send(MSG_SET_FREQ,   [ch, RF_FREQ]);
      await this.send(MSG_OPEN_CH,    [ch]);
      this.cb.onChannelUpdate(CH_NAMES[ch], 'searching');
    }

    this.cb.onLog('Canais abertos. Aguardando sensores ANT+...', 'info');
  }

  private startReadLoop(): void {
    const readable = this.port?.readable;
    if (!readable) return;
    const reader = readable.getReader();

    const loop = async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const byte of value) this.processByte(byte);
        }
      } catch { /* port closed or error */ } finally {
        reader.releaseLock();
        this.cb.onDisconnect();
      }
    };
    loop();
  }

  // State-machine byte buffer — expects: SYNC | LEN | MSG_ID | DATA[LEN] | CHK
  private processByte(byte: number): void {
    if (this.buf.length === 0) {
      if (byte !== SYNC) return;
      this.buf.push(byte);
      return;
    }
    this.buf.push(byte);

    if (this.buf.length < 3) return;

    const msgLen   = this.buf[1];
    const totalLen = 4 + msgLen; // SYNC + LEN + MSG_ID + data + CHK
    if (this.buf.length < totalLen) return;

    // Validate XOR checksum
    let chk = 0;
    for (let i = 1; i < totalLen - 1; i++) chk ^= this.buf[i];

    if (chk === this.buf[totalLen - 1] && this.buf[2] === MSG_BROADCAST && msgLen === 9) {
      const ch   = this.buf[3];
      const data = new Uint8Array(this.buf.slice(4, 12));
      this.dispatchBroadcast(ch, data);
    }

    this.buf = [];
  }

  private dispatchBroadcast(ch: number, data: Uint8Array): void {
    if (ch >= CH_NAMES.length) return;
    switch (ch) {
      case 0: this.parseHR(data);    break;
      case 1: this.parsePower(data); break;
      case 2: this.parseCSC(data);   break;
      case 3: this.parseFEC(data);   break;
    }
  }

  private parseHR(data: Uint8Array): void {
    const bpm = data[7];
    if (bpm > 0 && bpm < 250) {
      this.cb.onChannelUpdate('hr', 'found');
      this.cb.onHR(bpm);
    }
  }

  private parsePower(data: Uint8Array): void {
    // Only handle page 16 (standard power)
    if ((data[0] & 0x7F) !== 0x10) return;
    const cadence = data[3];
    const power   = data[6] | (data[7] << 8);
    if (power < 3000) {
      this.cb.onChannelUpdate('power', 'found');
      this.cb.onPower(power, cadence < 255 ? cadence : undefined);
    }
  }

  private parseCSC(data: Uint8Array): void {
    // Crank revolution data: bytes 4-5 = event time (1024 Hz), bytes 6-7 = cumulative revs
    const crankTime = data[4] | (data[5] << 8);
    const crankRevs = data[6] | (data[7] << 8);

    if (!this.cscPrev.init) {
      this.cscPrev = { rev: crankRevs, time: crankTime, init: true };
      return;
    }
    const dRev  = (crankRevs - this.cscPrev.rev  + 65536) % 65536;
    const dTime = (crankTime - this.cscPrev.time + 65536) % 65536;
    this.cscPrev = { rev: crankRevs, time: crankTime, init: true };

    if (dTime > 0) {
      const cad = Math.round(dRev / dTime * 1024 * 60);
      if (cad >= 0 && cad < 300) {
        this.cb.onChannelUpdate('csc', 'found');
        this.cb.onCSC(cad);
      }
    }
  }

  private parseFEC(data: Uint8Array): void {
    // Page 25 = General FE Data: byte 2 = cadence, bytes 5-6 = power (12-bit)
    if (data[0] !== 25) return;
    const cadence = data[2];
    const power   = (data[5] | (data[6] << 8)) & 0x0FFF;
    if (power < 3000) {
      this.cb.onChannelUpdate('fec', 'found');
      this.cb.onFEC(power, cadence < 255 ? cadence : undefined);
    }
  }
}
