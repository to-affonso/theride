export * from './ble';
export type { GpxPoint } from '@/lib/gpx';

export type PowerSmoothingSeconds = 1 | 3 | 5 | 10;

export interface Athlete {
  id: string;
  user_id: string;
  name: string;
  ftp: number;
  weight: number;
  max_hr: number;
  bike: string;
  created_at: string;

  // Migration 002 — Settings screen.
  birth_date?: string | null;
  power_smoothing_seconds: PowerSmoothingSeconds;
  auto_lap_enabled: boolean;
  auto_lap_distance_km: number;
  /** Upper bounds of Z1..Z6 as fractions of max_hr (Z7 is implicit catch-all). Length 6. */
  hr_zones: number[];
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
  /** Z6/Z7 added in migration 002 (HR uses Friel 7-zone model). Legacy rows may only have z1..z5. */
  hr_zone_seconds?: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5' | 'z6' | 'z7', number>> | null;

  // Session-level
  notes?: string;
  strava_activity_id?: string | null;

  devices: {
    trainer: string | null;
    cadence: string | null;
    hr: string | null;
    /** Optional CSC speed sensor (added with /settings refresh). Legacy rows omit. */
    speed?: string | null;
  };
  created_at: string;

  // Joined route (when query includes it)
  routes?: Pick<Route, 'id' | 'name' | 'location' | 'distance_km' | 'elevation_m'> | null;
}
