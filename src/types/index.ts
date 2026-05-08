export * from './ble';
export type { GpxPoint } from '@/lib/gpx';

export interface Athlete {
  id: string;
  user_id: string;
  name: string;
  ftp: number;
  weight: number;
  max_hr: number;
  bike: string;
  created_at: string;
}

export interface Route {
  id: string;
  name: string;
  location: string;
  distance_km: number;
  elevation_m: number;
  estimated_time_min: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  type: 'Hills' | 'Recovery' | 'Climb' | 'Endurance' | 'Sprint';
  gpx_data?: { points: import('@/lib/gpx').GpxPoint[] } | null;
  created_at: string;
}

export interface Session {
  id: string;
  athlete_id: string;
  route_id: string | null;
  started_at: string;
  duration_s: number;
  avg_power: number;
  avg_hr: number;
  calories: number;
  distance_km: number;
  tss: number;
  power_series: number[];
  hr_series: number[];
  devices: {
    trainer: string | null;
    cadence: string | null;
    hr: string | null;
  };
  created_at: string;
}
