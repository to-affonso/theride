/**
 * Power and Heart Rate zone definitions.
 *
 * Canonical source — DO NOT redefine zones inline anywhere else.
 * Import `POWER_ZONES`, `HR_ZONES`, `getPowerZone`, `getHrZone` from here.
 *
 * Power zones follow Coggan model (5-zone MVP simplification; Z6-Z7 collapsed into Z5).
 * HR zones follow Friel 7-zone %-of-MaxHR. Defaults can be overridden per-athlete
 * via `bounds` (6 numbers = upper bounds of Z1..Z6 as fractions of MaxHR; Z7 is
 * the implicit catch-all).
 */

export type PowerZoneId = 'z1' | 'z2' | 'z3' | 'z4' | 'z5';
export type HrZoneId    = 'z1' | 'z2' | 'z3' | 'z4' | 'z5' | 'z6' | 'z7';

export interface PowerZone {
  id: PowerZoneId;
  label: string;       // short display, e.g. "Z1"
  name: string;        // descriptive, e.g. "Recuperação"
  color: string;       // OKLCH color string (matches design system)
  max: number;         // upper bound as fraction of FTP (e.g. 0.55 = 55%)
}

export interface HrZone {
  id: HrZoneId;
  label: string;
  name: string;
  color: string;
  max: number;         // upper bound as fraction of MaxHR
}

/**
 * Power zones (Coggan, 5-zone simplification).
 * `max` is the upper bound as a fraction of FTP.
 * Z5 catches everything above 105% FTP (Threshold, VO2 Max, Anaerobic, Sprint).
 */
export const POWER_ZONES: readonly PowerZone[] = [
  { id: 'z1', label: 'Z1', name: 'Recuperação', color: 'oklch(0.5 0.05 250)',  max: 0.55 },
  { id: 'z2', label: 'Z2', name: 'Endurance',   color: 'oklch(0.7 0.14 180)',  max: 0.75 },
  { id: 'z3', label: 'Z3', name: 'Tempo',       color: 'oklch(0.78 0.18 60)',  max: 0.90 },
  { id: 'z4', label: 'Z4', name: 'Limiar',      color: 'oklch(0.7 0.2 340)',   max: 1.05 },
  { id: 'z5', label: 'Z5', name: 'VO2 Máx',    color: 'oklch(0.65 0.22 25)',  max: 99   },
] as const;

/**
 * Default HR zone upper bounds (Friel 7-zone model, percent of MaxHR).
 * Used when an athlete has no custom zones, or as the reset baseline.
 */
export const DEFAULT_HR_ZONE_BOUNDS: readonly number[] = [0.45, 0.65, 0.75, 0.82, 0.89, 0.94] as const;

interface HrZoneMeta {
  id: HrZoneId;
  label: string;
  name: string;
  color: string;
}

/** Static metadata (id/label/name/color) for each of the 7 HR zones. */
const HR_ZONE_META: readonly HrZoneMeta[] = [
  { id: 'z1', label: 'Z1', name: 'Recuperação',     color: 'oklch(0.55 0.04 280)' },
  { id: 'z2', label: 'Z2', name: 'Aeróbico Leve',   color: 'oklch(0.7 0.14 220)'  },
  { id: 'z3', label: 'Z3', name: 'Aeróbico',        color: 'oklch(0.78 0.16 160)' },
  { id: 'z4', label: 'Z4', name: 'Tempo',           color: 'oklch(0.82 0.18 90)'  },
  { id: 'z5', label: 'Z5', name: 'Limiar',          color: 'oklch(0.75 0.18 50)'  },
  { id: 'z6', label: 'Z6', name: 'VO2',             color: 'oklch(0.65 0.22 25)'  },
  { id: 'z7', label: 'Z7', name: 'Anaeróbico',      color: 'oklch(0.58 0.22 340)' },
] as const;

/**
 * Build a 7-entry HR_ZONES array from `bounds` (length 6).
 * The last zone (Z7) always has `max = 99` (catch-all).
 */
export function buildHrZones(bounds: readonly number[] = DEFAULT_HR_ZONE_BOUNDS): HrZone[] {
  if (bounds.length !== 6) {
    bounds = DEFAULT_HR_ZONE_BOUNDS;
  }
  return HR_ZONE_META.map((m, i) => ({
    ...m,
    max: i < 6 ? bounds[i] : 99,
  }));
}

/**
 * Default HR zones (Friel, 7-zone, percent of MaxHR).
 * Use `buildHrZones(athlete.hr_zones)` when you have custom bounds.
 */
export const HR_ZONES: readonly HrZone[] = buildHrZones();

/**
 * Return the power zone for a given instantaneous power and FTP.
 * Falls back to Z5 if power exceeds all bounds, or Z1 if FTP <= 0.
 */
export function getPowerZone(power: number, ftp: number): PowerZone {
  if (ftp <= 0) return POWER_ZONES[0];
  const pct = power / ftp;
  return POWER_ZONES.find(z => pct < z.max) ?? POWER_ZONES[POWER_ZONES.length - 1];
}

/**
 * Return the HR zone for a given instantaneous HR and MaxHR.
 * Optional `bounds` (length 6) overrides the default Friel zones.
 */
export function getHrZone(hr: number, maxHr: number, bounds?: readonly number[]): HrZone {
  const zones = bounds ? buildHrZones(bounds) : HR_ZONES;
  if (maxHr <= 0) return zones[0];
  const pct = hr / maxHr;
  return zones.find(z => pct < z.max) ?? zones[zones.length - 1];
}
