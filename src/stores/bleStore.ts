'use client';

import { create } from 'zustand';
import { BleState, DeviceType, Lap, PowerSmoothingSeconds } from '@/types';

const INITIAL_DEVICE = { device: null, connected: false, connecting: false, name: '' };

// Battery service UUID — added to every device's optionalServices so we
// can opportunistically read battery level once connected.
const BATTERY_SVC = '0000180f-0000-1000-8000-00805f9b34fb';

const DEVICE_CONFIG = {
  trainer: {
    label: 'Smart Trainer',
    desc: 'FTMS / Cycling Power · potência, cadência, velocidade',
    protocols: ['BLE', 'FTMS'],
    request: {
      filters: [
        { services: ['00001826-0000-1000-8000-00805f9b34fb'] },
        { services: ['00001818-0000-1000-8000-00805f9b34fb'] },
      ],
      optionalServices: [
        '00001826-0000-1000-8000-00805f9b34fb',
        '00001818-0000-1000-8000-00805f9b34fb',
        '00001816-0000-1000-8000-00805f9b34fb',
        BATTERY_SVC,
      ],
    },
  },
  cadence: {
    label: 'Sensor de Cadência',
    desc: 'CSC / Cycling Power · cadência',
    protocols: ['BLE', 'CSC'],
    request: {
      filters: [
        { services: ['00001816-0000-1000-8000-00805f9b34fb'] },
        { services: ['00001818-0000-1000-8000-00805f9b34fb'] },
      ],
      optionalServices: [
        '00001816-0000-1000-8000-00805f9b34fb',
        '00001818-0000-1000-8000-00805f9b34fb',
        BATTERY_SVC,
      ],
    },
  },
  speed: {
    label: 'Sensor de Velocidade',
    desc: 'CSC · velocidade (calculada a partir das revoluções da roda)',
    protocols: ['BLE', 'CSC'],
    request: {
      filters: [
        { services: ['00001816-0000-1000-8000-00805f9b34fb'] },
      ],
      optionalServices: [
        '00001816-0000-1000-8000-00805f9b34fb',
        BATTERY_SVC,
      ],
    },
  },
  hr: {
    label: 'Monitor Cardíaco',
    desc: 'Heart Rate Service · frequência cardíaca',
    protocols: ['BLE', 'HR'],
    request: {
      acceptAllDevices: true,
      optionalServices: ['0000180d-0000-1000-8000-00805f9b34fb', BATTERY_SVC],
    },
  },
};

interface BleStore extends BleState {
  connect: (type: DeviceType) => Promise<void>;
  disconnect: (type: DeviceType) => void;
  /** Manually re-establish the GATT connection for a known device (no chooser). */
  reconnect: (type: DeviceType) => Promise<void>;
  /** Dismiss the disconnect popup without reconnecting. */
  dismissDisconnect: () => void;
  resetSession: () => void;
  startSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  updateMetric: (metric: 'power' | 'cadence' | 'hr' | 'speed', value: number, source?: DeviceType | 'ant') => void;
  addLog: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
  setFtp: (ftp: number) => void;
  setWeight: (weight: number) => void;
  setTargetPower: (watts: number) => Promise<void>;
  setGrade: (grade: number) => Promise<void>;
  // ── Sprint 4 ────────────────────────────────────────────────────────────────
  /** Switch the on-screen smoothing window (seconds). */
  setSmoothingSeconds: (s: PowerSmoothingSeconds) => void;
  /** Configure auto-lap distance. Pass `null` to disable. */
  setAutoLapKm: (km: number | null) => void;
  /** Close the current lap and start a new one. */
  addLap: (kind?: 'manual' | 'auto') => void;

  // ── Sprint 6 ────────────────────────────────────────────────────────────────
  /**
   * Attempt to re-pair without showing the chooser by walking
   * `navigator.bluetooth.getDevices()` and matching the IDs remembered
   * during previous successful connections. Silently no-op on browsers
   * that don't expose `getDevices()`.
   */
  autoReconnect: () => Promise<void>;
  /** Open the spindown modal (state → 'prompting'). */
  openSpindown: () => void;
  /** Send the FTMS Spin Down Control opcode and listen for the response. */
  startSpindown: () => Promise<void>;
  /** Close the spindown modal (state → 'idle'). */
  closeSpindown: () => void;
}

/** localStorage key for the list of devices the user has paired with. */
const KNOWN_DEVICES_KEY = 'theride.knownDevices';

interface KnownDevice {
  type: DeviceType;
  id:   string;        // BluetoothDevice.id (stable per origin)
  name: string;
}

function loadKnownDevices(): KnownDevice[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KNOWN_DEVICES_KEY) ?? '[]');
  } catch { return []; }
}

function saveKnownDevice(entry: KnownDevice) {
  if (typeof window === 'undefined') return;
  const list = loadKnownDevices().filter(d => d.type !== entry.type);
  list.push(entry);
  localStorage.setItem(KNOWN_DEVICES_KEY, JSON.stringify(list));
}

export const useBleStore = create<BleStore>((set, get) => {
  let sessionInterval: ReturnType<typeof setInterval> | null = null;
  let cpPrev:  { rev: number | null; time: number | null } = { rev: null, time: null };
  let cscPrev: { rev: number | null; time: number | null } = { rev: null, time: null };
  // Separate prev state for the dedicated speed sensor (wheel-rev side of CSC).
  let speedPrev: { rev: number | null; time: number | null } = { rev: null, time: null };
  // Default wheel circumference: 700x25c ≈ 2.105 m. Plenty close for indoor cadence-sourced speed.
  const WHEEL_CIRCUMFERENCE_M = 2.105;
  // FTMS Control Point characteristic for ERG mode
  let ftmsControlPoint: BluetoothRemoteGATTCharacteristic | null = null;

  // ── Rolling buffers (closure state — kept off the store to avoid
  //    re-renders on every sample). Each entry: [timestamp_ms, value].
  //    The window length is driven by `smoothingSeconds` on the store.
  const powerSmoothBuf: [number, number][] = [];
  const hrSmoothBuf:    [number, number][] = [];

  /** Drop entries older than `windowMs` and return the average. */
  function rollingAvg(buf: [number, number][], now: number, windowMs: number): number | null {
    while (buf.length > 0 && now - buf[0][0] > windowMs) buf.shift();
    if (buf.length === 0) return null;
    let sum = 0;
    for (const [, v] of buf) sum += v;
    return sum / buf.length;
  }

  // ── Per-lap baseline counters. The current lap's average power/HR is
  //    `(currentSum - lapBaseline.sum) / (currentSamples - lapBaseline.samples)`.
  let lapBaseline = {
    powerSum:    0,
    powerSamples: 0,
    hrSum:       0,
    hrSamples:   0,
    distanceKm:  0,
    elapsed:     0,
    startedAt:   0,
  };

  function resetLapBaseline(elapsed = 0, distanceKm = 0) {
    lapBaseline = {
      powerSum: 0, powerSamples: 0, hrSum: 0, hrSamples: 0,
      distanceKm, elapsed, startedAt: Date.now(),
    };
  }

  function addLogImpl(msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const now = new Date();
    const t = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map(n => String(n).padStart(2, '0')).join(':');
    set(s => ({ log: [{ t, msg, type }, ...s.log].slice(0, 40) }));
  }

  function updateMetricImpl(
    metric: 'power' | 'cadence' | 'hr' | 'speed',
    value: number,
    source?: DeviceType | 'ant',
  ) {
    const now = Date.now();

    // Update rolling buffers outside React state for cheap recompute.
    if (metric === 'power') {
      powerSmoothBuf.push([now, Math.max(0, value)]);
    } else if (metric === 'hr' && value > 0) {
      hrSmoothBuf.push([now, value]);
    }

    set(s => {
      const next = { ...s };

      if (metric === 'power')   { next.power   = value; next.sources = { ...s.sources, power:   source ?? null }; }
      if (metric === 'cadence') { next.cadence = value; next.sources = { ...s.sources, cadence: source ?? null }; }
      if (metric === 'hr')      { next.hr      = value; next.sources = { ...s.sources, hr:      source ?? null }; }
      if (metric === 'speed')   { next.speed   = value; }

      // Recompute smoothed values from the rolling buffers using the configured window.
      const windowMs = s.smoothingSeconds * 1000;
      next.powerSmoothed = rollingAvg(powerSmoothBuf, now, windowMs);
      next.hrSmoothed    = rollingAvg(hrSmoothBuf,    now, windowMs);

      if (s.sessionStart && !s.sessionPaused) {
        if (metric === 'power' && value > 0) {
          next.powerSum     = s.powerSum + value;
          next.powerSamples = s.powerSamples + 1;
          next.calories     = s.calories + value / 3600 / 0.25;
          const ps = [...s.sessionPowerSeries, value];
          next.sessionPowerSeries = ps.length > 3600 ? ps.slice(-3600) : ps;
        }
        if (metric === 'hr' && value > 0) {
          next.hrSum     = s.hrSum + value;
          next.hrSamples = s.hrSamples + 1;
          const hs = [...s.sessionHrSeries, value];
          next.sessionHrSeries = hs.length > 3600 ? hs.slice(-3600) : hs;
        }
        if (metric === 'cadence' && value >= 0) {
          const cs = [...s.sessionCadenceSeries, value];
          next.sessionCadenceSeries = cs.length > 3600 ? cs.slice(-3600) : cs;
        }
        if (metric === 'speed' && value >= 0) {
          const ss = [...s.sessionSpeedSeries, value];
          next.sessionSpeedSeries = ss.length > 3600 ? ss.slice(-3600) : ss;
        }
      }

      const ph = [...s.powerHistory.slice(1), next.power ?? 0];
      const hh = [...s.hrHistory.slice(1),    next.hr    ?? 0];
      next.powerHistory = ph;
      next.hrHistory    = hh;

      return next;
    });
  }

  function parseFTMS(event: Event) {
    const d     = (event.target as BluetoothRemoteGATTCharacteristic).value!;
    const flags = d.getUint16(0, true);
    let   off   = 2;
    let   spd: number | null = null;
    if (!(flags & 0x0001)) { spd = d.getUint16(off, true) / 100; off += 2; }
    if (flags & 0x0002) off += 2;
    let cad: number | null = null;
    if (flags & 0x0004) { cad = d.getUint16(off, true) / 2; off += 2; }
    if (flags & 0x0008) off += 2;
    if (flags & 0x0010) off += 3;
    if (flags & 0x0020) off += 2;
    let pwr: number | null = null;
    if (flags & 0x0040) pwr = d.getInt16(off, true);
    if (pwr !== null) updateMetricImpl('power',   Math.max(0, pwr), 'trainer');
    if (cad !== null) updateMetricImpl('cadence', Math.round(cad),  'trainer');
    if (spd !== null) updateMetricImpl('speed',   spd,              'trainer');
  }

  function parseCyclingPower(event: Event) {
    const d     = (event.target as BluetoothRemoteGATTCharacteristic).value!;
    const flags = d.getUint16(0, true);
    const pwr   = d.getInt16(2, true);
    updateMetricImpl('power', Math.max(0, pwr), 'trainer');
    if (flags & 0x0010 && d.byteLength >= 9) {
      const rev  = d.getUint16(4, true);
      const time = d.getUint16(6, true);
      if (cpPrev.rev !== null && cpPrev.time !== null) {
        const dRev  = (rev  - cpPrev.rev  + 65536) % 65536;
        const dTime = (time - cpPrev.time + 65536) % 65536;
        if (dTime > 0) {
          const cad = Math.round(dRev / dTime * 1024 * 60);
          if (cad >= 0 && cad < 300) updateMetricImpl('cadence', cad, 'trainer');
        }
      }
      cpPrev = { rev, time };
    }
  }

  function parseCSC(event: Event) {
    const d     = (event.target as BluetoothRemoteGATTCharacteristic).value!;
    const flags = d.getUint8(0);
    let   off   = 1;
    if (flags & 0x01) off += 6;
    if (flags & 0x02 && d.byteLength >= off + 4) {
      const rev  = d.getUint16(off,     true);
      const time = d.getUint16(off + 2, true);
      if (cscPrev.rev !== null && cscPrev.time !== null) {
        const dRev  = (rev  - cscPrev.rev  + 65536) % 65536;
        const dTime = (time - cscPrev.time + 65536) % 65536;
        if (dTime > 0) {
          const cad = Math.round(dRev / dTime * 1024 * 60);
          if (cad >= 0 && cad < 300) updateMetricImpl('cadence', cad, 'cadence');
        }
      }
      cscPrev = { rev, time };
    }
  }

  /**
   * Parse CSC for the SPEED side (wheel revolutions). Computes km/h from
   * delta-rev / delta-time using a fixed wheel circumference.
   */
  function parseSpeedCSC(event: Event) {
    const d     = (event.target as BluetoothRemoteGATTCharacteristic).value!;
    const flags = d.getUint8(0);
    if (!(flags & 0x01)) return; // no wheel-rev data in this packet
    if (d.byteLength < 7) return;
    const rev  = d.getUint32(1, true);
    const time = d.getUint16(5, true); // 1/1024 s
    if (speedPrev.rev !== null && speedPrev.time !== null) {
      const dRev  = (rev  - speedPrev.rev  + 0x100000000) % 0x100000000;
      const dTime = (time - speedPrev.time + 65536) % 65536;
      if (dTime > 0) {
        const seconds = dTime / 1024;
        const mPerS   = (dRev * WHEEL_CIRCUMFERENCE_M) / seconds;
        const kmh     = mPerS * 3.6;
        if (kmh >= 0 && kmh < 120) updateMetricImpl('speed', kmh, 'speed');
      }
    }
    speedPrev = { rev, time };
  }

  function parseHR(event: Event) {
    const d     = (event.target as BluetoothRemoteGATTCharacteristic).value!;
    const flags = d.getUint8(0);
    const hr    = (flags & 0x01) ? d.getUint16(1, true) : d.getUint8(1);
    updateMetricImpl('hr', hr, 'hr');
  }

  async function subscribeTrainer(server: BluetoothRemoteGATTServer, name: string) {
    try {
      const svc  = await server.getPrimaryService('00001826-0000-1000-8000-00805f9b34fb');
      const char = await svc.getCharacteristic('00002ad2-0000-1000-8000-00805f9b34fb');
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', parseFTMS);
      addLogImpl(`${name}: FTMS Indoor Bike Data ativo.`, 'success');

      // Try to acquire FTMS Control Point for ERG mode
      try {
        const cp = await svc.getCharacteristic('00002ad9-0000-1000-8000-00805f9b34fb');
        await cp.startNotifications();
        await cp.writeValueWithResponse(new Uint8Array([0x00])); // Request Control
        ftmsControlPoint = cp;
        set({ ergEnabled: true });
        addLogImpl(`${name}: ERG (FTMS Control Point) disponível.`, 'success');
      } catch {
        addLogImpl(`${name}: ERG indisponível neste trainer.`, 'warn');
      }
      return;
    } catch { addLogImpl(`${name}: FTMS indisponível — tentando Cycling Power...`, 'warn'); }
    try {
      const svc  = await server.getPrimaryService('00001818-0000-1000-8000-00805f9b34fb');
      const char = await svc.getCharacteristic('00002a63-0000-1000-8000-00805f9b34fb');
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', parseCyclingPower);
      addLogImpl(`${name}: Cycling Power Service ativo.`, 'success');
    } catch { addLogImpl(`${name}: nenhum protocolo de potência encontrado.`, 'error'); }
  }

  async function subscribeCadence(server: BluetoothRemoteGATTServer, name: string) {
    try {
      const svc  = await server.getPrimaryService('00001816-0000-1000-8000-00805f9b34fb');
      const char = await svc.getCharacteristic('00002a5b-0000-1000-8000-00805f9b34fb');
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', parseCSC);
      addLogImpl(`${name}: CSC cadência ativo.`, 'success');
    } catch {
      try {
        const svc  = await server.getPrimaryService('00001818-0000-1000-8000-00805f9b34fb');
        const char = await svc.getCharacteristic('00002a63-0000-1000-8000-00805f9b34fb');
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', parseCyclingPower);
        addLogImpl(`${name}: cadência via Cycling Power.`, 'success');
      } catch { addLogImpl(`${name}: cadência não reconhecida.`, 'error'); }
    }
  }

  async function subscribeSpeed(server: BluetoothRemoteGATTServer, name: string) {
    try {
      const svc  = await server.getPrimaryService('00001816-0000-1000-8000-00805f9b34fb');
      const char = await svc.getCharacteristic('00002a5b-0000-1000-8000-00805f9b34fb');
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', parseSpeedCSC);
      addLogImpl(`${name}: CSC velocidade ativo.`, 'success');
    } catch { addLogImpl(`${name}: serviço CSC velocidade não encontrado.`, 'error'); }
  }

  async function subscribeHR(server: BluetoothRemoteGATTServer, name: string) {
    try {
      const svc  = await server.getPrimaryService('0000180d-0000-1000-8000-00805f9b34fb');
      const char = await svc.getCharacteristic('00002a37-0000-1000-8000-00805f9b34fb');
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', parseHR);
      addLogImpl(`${name}: Heart Rate Service ativo.`, 'success');
    } catch { addLogImpl(`${name}: serviço HR não encontrado neste dispositivo.`, 'error'); }
  }

  /**
   * Subscribe to the standard Battery Service (0x180F). Best-effort —
   * many trainers/sensors don't expose it, in which case we just leave
   * `battery[type]` null.
   */
  async function subscribeBattery(
    server: BluetoothRemoteGATTServer,
    type: DeviceType,
    name: string,
  ) {
    try {
      const svc  = await server.getPrimaryService('0000180f-0000-1000-8000-00805f9b34fb');
      const char = await svc.getCharacteristic('00002a19-0000-1000-8000-00805f9b34fb');
      const read = await char.readValue();
      const pct  = read.getUint8(0);
      set(prev => ({ battery: { ...prev.battery, [type]: pct } }));
      // Subscribe for live updates if supported.
      try {
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', (e: Event) => {
          const v = (e.target as BluetoothRemoteGATTCharacteristic).value!;
          set(prev => ({ battery: { ...prev.battery, [type]: v.getUint8(0) } }));
        });
      } catch { /* notifications unsupported — readValue was enough */ }
      addLogImpl(`${name}: bateria ${pct}%.`, 'info');
    } catch {
      // Not all devices advertise battery — silent fail.
    }
  }

  /** Close the current lap. Computes avg power/HR from the running deltas. */
  function addLapImpl(kind: 'manual' | 'auto' = 'manual') {
    const s = get();
    if (!s.sessionStart) return;

    const lapPowerSum     = s.powerSum    - lapBaseline.powerSum;
    const lapPowerSamples = s.powerSamples - lapBaseline.powerSamples;
    const lapHrSum        = s.hrSum       - lapBaseline.hrSum;
    const lapHrSamples    = s.hrSamples   - lapBaseline.hrSamples;

    const lapDistanceKm = Math.max(0, s.distanceKm - lapBaseline.distanceKm);
    const lapDurationS  = Math.max(0, s.elapsed   - lapBaseline.elapsed);

    if (lapDurationS < 2) return; // ignore accidental double-taps

    const lap: Lap = {
      index:      s.laps.length + 1,
      distanceKm: lapDistanceKm,
      durationS:  lapDurationS,
      avgPower:   lapPowerSamples > 0 ? Math.round(lapPowerSum / lapPowerSamples) : 0,
      avgHr:      lapHrSamples    > 0 ? Math.round(lapHrSum    / lapHrSamples)    : null,
      startedAt:  lapBaseline.startedAt,
      kind,
    };

    set({ laps: [...s.laps, lap] });
    resetLapBaseline(s.elapsed, s.distanceKm);
    addLogImpl(
      `Lap ${lap.index} ${kind === 'auto' ? '(auto)' : ''} · ${lap.distanceKm.toFixed(2)} km · ${lap.avgPower}W`,
      'info',
    );
  }

  /** Session tick — updates elapsed, distance, and triggers auto-lap. */
  function tickSession() {
    set(s => {
      const elapsed = s.sessionStart ? Math.floor((Date.now() - s.sessionStart!) / 1000) : 0;
      if (s.sessionPaused || s.speed === null || s.speed <= 0) return { elapsed };
      return { elapsed, distanceKm: s.distanceKm + s.speed / 3600 };
    });

    // Auto-lap trigger.
    const s = get();
    if (s.autoLapKm != null && s.autoLapKm > 0) {
      const dist = s.distanceKm - lapBaseline.distanceKm;
      if (dist >= s.autoLapKm) addLapImpl('auto');
    }
  }

  function startSession() {
    const start = Date.now();
    set({ sessionStart: start, elapsed: 0 });
    resetLapBaseline(0, 0);
    sessionInterval = setInterval(tickSession, 1000);
    addLogImpl('Sessão iniciada.', 'success');
  }

  return {
    isSupported: typeof navigator !== 'undefined' && !!navigator.bluetooth,
    devices: {
      trainer: { ...INITIAL_DEVICE },
      cadence: { ...INITIAL_DEVICE },
      speed:   { ...INITIAL_DEVICE },
      hr:      { ...INITIAL_DEVICE },
    },
    power: null, cadence: null, hr: null, speed: null,
    sources: { power: null, cadence: null, hr: null },
    powerHistory: new Array(60).fill(null),
    hrHistory:    new Array(60).fill(null),
    powerSum: 0, powerSamples: 0,
    hrSum: 0,    hrSamples: 0,
    calories: 0, distanceKm: 0,
    sessionStart: null, elapsed: 0,
    ftp: 258, weight: 72.4,
    sessionPowerSeries: [], sessionHrSeries: [],
    sessionCadenceSeries: [], sessionSpeedSeries: [],
    sessionPaused: false,
    ergEnabled: false,
    log: [],
    deviceConfig: DEVICE_CONFIG,

    battery: { trainer: null, cadence: null, speed: null, hr: null },

    // ── Sprint 4 ──
    powerSmoothed: null,
    hrSmoothed:    null,
    smoothingSeconds: 3,
    laps:      [],
    autoLapKm: null,
    disconnectAlert: null,
    spindown:  { phase: 'idle', message: '' },

    addLog: addLogImpl,
    updateMetric: updateMetricImpl,
    setFtp:    (ftp)    => set({ ftp }),
    setWeight: (weight) => set({ weight }),
    setSmoothingSeconds: (s) => set({ smoothingSeconds: s }),
    setAutoLapKm:  (km) => set({ autoLapKm: km }),
    addLap:        (kind = 'manual') => addLapImpl(kind),
    dismissDisconnect: () => set({ disconnectAlert: null }),

    autoReconnect: async () => {
      // Web Bluetooth's "Permitted Devices" API is gated behind a flag in
      // older Chrome and missing entirely on Safari. Bail out silently.
      const nb = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> };
      if (!nb || typeof nb.getDevices !== 'function') return;

      const known = loadKnownDevices();
      if (known.length === 0) return;

      let granted: BluetoothDevice[] = [];
      try { granted = await nb.getDevices(); }
      catch { return; }

      for (const entry of known) {
        // Skip if already connected.
        if (get().devices[entry.type].connected) continue;
        const dev = granted.find(d => d.id === entry.id);
        if (!dev) continue;

        try {
          set(prev => ({
            devices: { ...prev.devices, [entry.type]: { device: dev, connected: false, connecting: true, name: entry.name } },
          }));
          const server = await dev.gatt!.connect();
          if (entry.type === 'trainer') await subscribeTrainer(server, entry.name);
          if (entry.type === 'cadence') await subscribeCadence(server, entry.name);
          if (entry.type === 'speed')   await subscribeSpeed(server, entry.name);
          if (entry.type === 'hr')      await subscribeHR(server, entry.name);
          subscribeBattery(server, entry.type, entry.name);
          set(prev => ({
            devices: { ...prev.devices, [entry.type]: { device: dev, connected: true, connecting: false, name: entry.name } },
          }));
          addLogImpl(`${entry.name}: reconectado automaticamente.`, 'success');
        } catch (err) {
          set(prev => ({
            devices: { ...prev.devices, [entry.type]: { ...INITIAL_DEVICE } },
          }));
          addLogImpl(`Auto-reconexão falhou (${entry.name}): ${(err as Error).message}`, 'warn');
        }
      }
    },

    reconnect: async (type) => {
      const d = get().devices[type];
      const device = d.device;
      if (!device) {
        addLogImpl(`Sem dispositivo memorizado para ${type} — abra o seletor.`, 'warn');
        return;
      }
      set(prev => ({
        disconnectAlert: prev.disconnectAlert ? { ...prev.disconnectAlert, reconnecting: true } : null,
        devices: { ...prev.devices, [type]: { ...prev.devices[type], connecting: true } },
      }));
      try {
        const server = await device.gatt!.connect();
        if (type === 'trainer') await subscribeTrainer(server, d.name || device.name || 'Trainer');
        if (type === 'cadence') await subscribeCadence(server, d.name || device.name || 'Cadência');
        if (type === 'speed')   await subscribeSpeed(server, d.name || device.name || 'Velocidade');
        if (type === 'hr')      await subscribeHR(server, d.name || device.name || 'HR');
        set(prev => ({
          devices:    { ...prev.devices, [type]: { device, connected: true, connecting: false, name: d.name || device.name || '' } },
          disconnectAlert: null,
        }));
        addLogImpl(`${d.name || device.name}: reconectado manualmente.`, 'success');
        if (get().sessionPaused) get().resumeSession();
      } catch (err) {
        set(prev => ({
          disconnectAlert: prev.disconnectAlert ? { ...prev.disconnectAlert, reconnecting: false } : null,
          devices:    { ...prev.devices, [type]: { ...prev.devices[type], connecting: false } },
        }));
        addLogImpl(`Falha ao reconectar: ${(err as Error).message}`, 'error');
      }
    },

    resetSession: () => {
      if (sessionInterval) { clearInterval(sessionInterval); sessionInterval = null; }
      powerSmoothBuf.length = 0;
      hrSmoothBuf.length    = 0;
      resetLapBaseline(0, 0);
      set({
        sessionStart: null, elapsed: 0, sessionPaused: false,
        powerSum: 0, powerSamples: 0,
        hrSum: 0,    hrSamples: 0,
        calories: 0, distanceKm: 0,
        sessionPowerSeries: [], sessionHrSeries: [],
        sessionCadenceSeries: [], sessionSpeedSeries: [],
        powerSmoothed: null, hrSmoothed: null,
        laps: [], disconnectAlert: null,
      });
    },

    startSession,

    pauseSession: () => {
      if (sessionInterval) { clearInterval(sessionInterval); sessionInterval = null; }
      set({ sessionPaused: true });
    },

    resumeSession: () => {
      if (!get().sessionPaused) return;
      const el = get().elapsed;
      if (sessionInterval) { clearInterval(sessionInterval); sessionInterval = null; }
      set({ sessionStart: Date.now() - el * 1000, sessionPaused: false });
      sessionInterval = setInterval(tickSession, 1000);
    },

    connect: async (type) => {
      const s = get();
      if (!navigator.bluetooth) {
        addLogImpl('Web Bluetooth não suportado. Use Chrome ou Edge.', 'error');
        return;
      }
      if (s.devices[type].connecting || s.devices[type].connected) return;

      const cfg = DEVICE_CONFIG[type];
      set(prev => ({ devices: { ...prev.devices, [type]: { ...prev.devices[type], connecting: true } } }));
      addLogImpl(`Abrindo seletor BLE: ${cfg.label}...`, 'info');

      let device: BluetoothDevice;
      try {
        device = await navigator.bluetooth.requestDevice(cfg.request as RequestDeviceOptions);
      } catch (err: unknown) {
        set(prev => ({ devices: { ...prev.devices, [type]: { ...INITIAL_DEVICE } } }));
        const e = err as DOMException;
        if (e.name === 'NotFoundError' || e.name === 'AbortError') {
          addLogImpl(`Seleção cancelada: ${cfg.label}.`, 'warn');
        } else {
          addLogImpl(`Erro no seletor (${cfg.label}): ${e.message}`, 'error');
        }
        return;
      }

      addLogImpl(`Dispositivo selecionado: ${device.name || cfg.label} — conectando...`, 'info');

      try {
        const server = await device.gatt!.connect();
        addLogImpl(`GATT conectado: ${device.name}`, 'success');

        const devName = device.name || cfg.label;
        set(prev => ({
          devices: { ...prev.devices, [type]: { device, connected: true, connecting: false, name: devName } }
        }));

        device.addEventListener('gattserverdisconnected', async () => {
          // Sprint 4: pause on ANY sensor disconnect (not just trainer).
          const wasRunning = get().sessionStart !== null && !get().sessionPaused;

          addLogImpl(`${devName} desconectado — reconectando (10s)...`, 'warn');
          set(prev => ({
            devices:    { ...prev.devices, [type]: { device, connected: false, connecting: true, name: devName } },
            disconnectAlert: { type, name: devName, reconnecting: true },
          }));

          if (wasRunning) {
            get().pauseSession();
            addLogImpl(`Sessão pausada — ${devName} desconectado.`, 'warn');
          }

          let timedOut    = false;
          let reconnected = false;
          const timer = setTimeout(() => { timedOut = true; }, 10_000);

          for (let attempt = 1; attempt <= 3 && !timedOut; attempt++) {
            await new Promise(r => setTimeout(r, attempt * 1000));
            if (timedOut) break;
            try {
              const server = await device.gatt!.connect();
              if (timedOut) break;
              if (type === 'trainer') await subscribeTrainer(server, devName);
              if (type === 'cadence') await subscribeCadence(server, devName);
              if (type === 'speed')   await subscribeSpeed(server, devName);
              if (type === 'hr')      await subscribeHR(server, devName);
              reconnected = true;
              clearTimeout(timer);
              set(prev => ({
                devices: { ...prev.devices, [type]: { device, connected: true, connecting: false, name: devName } }
              }));
              addLogImpl(`${devName} reconectado (tentativa ${attempt}).`, 'success');
              break;
            } catch {
              addLogImpl(`Reconexão ${attempt}/3 falhou: ${devName}`, 'warn');
            }
          }

          clearTimeout(timer);

          if (reconnected) {
            set({ disconnectAlert: null });
            if (wasRunning) {
              get().resumeSession();
              addLogImpl(`Sessão retomada — ${devName} reconectado.`, 'success');
            }
          } else {
            if (type === 'trainer') { ftmsControlPoint = null; set({ ergEnabled: false }); }
            set(prev => {
              const next = { ...prev };
              next.devices = { ...prev.devices, [type]: { ...INITIAL_DEVICE } };
              if (prev.sources.power   === type) { next.power   = null; next.sources = { ...next.sources, power:   null }; }
              if (prev.sources.cadence === type) { next.cadence = null; next.sources = { ...next.sources, cadence: null }; }
              if (prev.sources.hr      === type) { next.hr      = null; next.sources = { ...next.sources, hr:      null }; }
              if (type === 'trainer' || type === 'speed') { next.speed = null; }
              // Keep the popup open with `reconnecting:false` so the user can retry manually.
              next.disconnectAlert = { type, name: devName, reconnecting: false };
              return next;
            });
            addLogImpl(
              timedOut
                ? `${devName}: timeout de 10s — clique em Reconectar para tentar de novo.`
                : `${devName}: sem reconexão após 3 tentativas — clique em Reconectar.`,
              'error',
            );
          }
        });

        if (type === 'trainer') await subscribeTrainer(server, devName);
        if (type === 'cadence') await subscribeCadence(server, devName);
        if (type === 'speed')   await subscribeSpeed(server, devName);
        if (type === 'hr')      await subscribeHR(server, devName);

        // Best-effort battery read — silently skipped if unsupported.
        subscribeBattery(server, type, devName);

        // Remember this device so a future visit can auto-reconnect without
        // showing the chooser (uses navigator.bluetooth.getDevices()).
        saveKnownDevice({ type, id: device.id, name: devName });

        if (!get().sessionStart) startSession();
      } catch (err: unknown) {
        set(prev => ({ devices: { ...prev.devices, [type]: { ...INITIAL_DEVICE } } }));
        addLogImpl(`Erro ao conectar ${cfg.label}: ${(err as Error).message}`, 'error');
      }
    },

    disconnect: (type) => {
      const d = get().devices[type];
      if (d.device?.gatt?.connected) {
        try { d.device.gatt.disconnect(); } catch { /* ignore */ }
      }
      if (type === 'trainer') { ftmsControlPoint = null; }
      set(prev => {
        const next = { ...prev };
        next.devices = { ...prev.devices, [type]: { ...INITIAL_DEVICE } };
        next.battery = { ...prev.battery, [type]: null };
        if (prev.sources.power   === type) { next.power   = null; next.sources = { ...next.sources, power:   null }; }
        if (prev.sources.cadence === type) { next.cadence = null; next.sources = { ...next.sources, cadence: null }; }
        if (prev.sources.hr      === type) { next.hr      = null; next.sources = { ...next.sources, hr:      null }; }
        if (type === 'trainer')             { next.speed   = null; next.ergEnabled = false; }
        if (type === 'speed')               { next.speed   = null; }
        return next;
      });
      addLogImpl(`${DEVICE_CONFIG[type].label} desconectado.`, 'warn');
    },

    setTargetPower: async (watts: number) => {
      if (!ftmsControlPoint) {
        addLogImpl('ERG: trainer não conectado ou sem suporte a FTMS Control Point.', 'warn');
        return;
      }
      const buf = new Uint8Array(3);
      buf[0] = 0x11; // Set Target Power op code
      new DataView(buf.buffer).setInt16(1, Math.max(0, Math.round(watts)), true);
      try {
        await ftmsControlPoint.writeValueWithResponse(buf);
        addLogImpl(`ERG: ${Math.round(watts)} W definido.`, 'info');
      } catch (err) {
        addLogImpl(`ERG erro: ${(err as Error).message}`, 'error');
      }
    },

    setGrade: async (grade: number) => {
      if (!ftmsControlPoint) return;
      // FTMS OpCode 0x12 — Set Indoor Bike Simulation Parameters
      // wind speed : int16  × 0.001 m/s  → 0
      // grade      : int16  × 0.01 %     → e.g. 5% = 500
      // Crr        : uint8  × 0.0001     → 40 = 0.0040 (asfalto)
      // Cw         : uint8  × 0.01 kg/m  → 51 = 0.51
      const gradeInt = Math.round(Math.max(-25, Math.min(25, grade)) * 100);
      const buf = new Uint8Array(7);
      const view = new DataView(buf.buffer);
      buf[0] = 0x12;
      view.setInt16(1, 0, true);       // wind speed
      view.setInt16(3, gradeInt, true); // grade
      buf[5] = 40;                      // Crr
      buf[6] = 51;                      // Cw
      try {
        await ftmsControlPoint.writeValueWithResponse(buf);
      } catch (err) {
        addLogImpl(`Simulation grade erro: ${(err as Error).message}`, 'error');
      }
    },

    openSpindown: () => set({ spindown: { phase: 'prompting', message: '' } }),
    closeSpindown: () => set({ spindown: { phase: 'idle', message: '' } }),

    startSpindown: async () => {
      if (!ftmsControlPoint) {
        set({ spindown: { phase: 'error', message: 'Trainer não está conectado via FTMS.' } });
        return;
      }

      set({ spindown: { phase: 'running', message: 'Pedale até atingir ~30 km/h e pare de pedalar.' } });

      // The Spin Down response is delivered as an indication on the
      // Fitness Machine Control Point itself (op 0x80 = Response).
      // We attach a one-shot listener with a 60 s timeout.
      let settled = false;
      const onIndication = (e: Event) => {
        const dv = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (!dv) return;
        const op       = dv.getUint8(0); // 0x80
        const reqOp    = dv.getUint8(1); // 0x4C if it's our spindown response
        const resultCd = dv.getUint8(2);
        if (op !== 0x80 || reqOp !== 0x4C) return;

        settled = true;
        ftmsControlPoint?.removeEventListener('characteristicvaluechanged', onIndication);

        // FTMS result codes: 0x01 = Success.
        if (resultCd === 0x01) {
          set({ spindown: { phase: 'success', message: 'Calibração concluída com sucesso.' } });
          addLogImpl('Spindown: calibração concluída.', 'success');
        } else {
          set({ spindown: { phase: 'error', message: `Falha (código 0x${resultCd.toString(16)}). Tente novamente.` } });
          addLogImpl(`Spindown falhou: 0x${resultCd.toString(16)}.`, 'error');
        }
      };

      ftmsControlPoint.addEventListener('characteristicvaluechanged', onIndication);

      // Send the Spin Down Control command (op 0x4C, param 0x01 = Start).
      try {
        const buf = new Uint8Array([0x4C, 0x01]);
        await ftmsControlPoint.writeValueWithResponse(buf);
        addLogImpl('Spindown: comando enviado, aguardando resposta…', 'info');
      } catch (err) {
        ftmsControlPoint.removeEventListener('characteristicvaluechanged', onIndication);
        set({ spindown: { phase: 'error', message: `Trainer rejeitou o comando: ${(err as Error).message}` } });
        return;
      }

      // 60 s safety timeout.
      setTimeout(() => {
        if (settled) return;
        ftmsControlPoint?.removeEventListener('characteristicvaluechanged', onIndication);
        if (get().spindown.phase === 'running') {
          set({ spindown: { phase: 'error', message: 'Sem resposta do trainer em 60s. Seu trainer pode não suportar spindown via FTMS.' } });
        }
      }, 60_000);
    },
  };
});
