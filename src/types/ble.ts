export type DeviceType = 'trainer' | 'cadence' | 'hr';

export type BleSource = DeviceType | 'ant' | null;

export interface DeviceInfo {
  device: BluetoothDevice | null;
  connected: boolean;
  connecting: boolean;
  name: string;
}

export interface DeviceConfig {
  label: string;
  desc: string;
  protocols: string[];
  request: RequestDeviceOptions;
}

export interface LogEntry {
  t: string;
  msg: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

/** Closed lap — either manual or auto. */
export interface Lap {
  /** 1-based index. */
  index:      number;
  /** Distance covered during this lap (km). */
  distanceKm: number;
  /** Lap duration in seconds. */
  durationS:  number;
  /** Average power during the lap (W). 0 if no power data. */
  avgPower:   number;
  /** Average HR during the lap (bpm). null if no HR data. */
  avgHr:      number | null;
  /** Wall-clock timestamp at lap start (ms). */
  startedAt:  number;
  /** 'manual' or 'auto'. */
  kind:       'manual' | 'auto';
}

/** State of a disconnected device — drives the live-page popup. */
export interface DisconnectState {
  type:        DeviceType;
  name:        string;
  reconnecting: boolean;
}

export interface BleState {
  isSupported: boolean;
  devices: Record<DeviceType, DeviceInfo>;
  power: number | null;
  cadence: number | null;
  hr: number | null;
  speed: number | null;
  sources: {
    power: BleSource;
    cadence: BleSource;
    hr: BleSource;
  };
  powerHistory: (number | null)[];
  hrHistory: (number | null)[];
  powerSum: number;
  powerSamples: number;
  hrSum: number;
  hrSamples: number;
  calories: number;
  distanceKm: number;
  sessionStart: number | null;
  elapsed: number;
  ftp: number;
  weight: number;
  sessionPowerSeries: number[];
  sessionHrSeries: number[];
  sessionCadenceSeries: number[];
  sessionSpeedSeries: number[];
  sessionPaused: boolean;
  log: LogEntry[];
  deviceConfig: Record<DeviceType, DeviceConfig>;
  ergEnabled: boolean;

  /** Per-device battery level (0-100). Null if unsupported or not yet read. */
  battery: Record<DeviceType, number | null>;

  // ── Sprint 4 additions ─────────────────────────────────────────────────────
  /** 3-second rolling average of power. Null when buffer is empty. */
  power3s: number | null;
  /** 3-second rolling average of HR. Null when buffer is empty. */
  hr3s:    number | null;
  /** Smoothing window applied to the on-screen primary value. Default '3s'. */
  smoothing: '1s' | '3s';
  /** Closed laps (manual + auto). */
  laps: Lap[];
  /** Auto-lap distance in km. null = disabled. */
  autoLapKm: number | null;
  /** The device that just disconnected (drives reconnect popup). */
  disconnectAlert: DisconnectState | null;
}
