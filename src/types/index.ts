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

  // Core
  avg_power: number;
  avg_hr: number;
  calories: number;
  distance_km: number;
  tss: number;

  // Time series
  power_series: number[];
  hr_series: number[];
  cadence_series?: number[];
  speed_series?: number[];

  // Advanced metrics (migration 001)
  normalized_power?: number | null;
  intensity_factor?: number | null;
  variability_index?: number | null;
  max_power?: number | null;
  max_hr?: number | null;
  avg_cadence?: number | null;
  kj?: number | null;
  total_ascent_m?: number | null;
  ftp_at_time?: number | null;

  // Distributions and curve (jsonb)
  best_power?: Partial<Record<'5s' | '30s' | '1min' | '5min' | '20min' | '60min', number>> | null;
  power_zone_seconds?: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number>> | null;
  hr_zone_seconds?: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number>> | null;

  // Session-level
  notes?: string;
  strava_activity_id?: string | null;

  devices: {
    trainer: string | null;
    cadence: string | null;
    hr: string | null;
  };
  created_at: string;

  // Joined route (when query includes it)
  routes?: Pick<Route, 'id' | 'name' | 'location' | 'distance_km' | 'elevation_m'> | null;
}
