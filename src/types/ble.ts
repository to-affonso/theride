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
}
