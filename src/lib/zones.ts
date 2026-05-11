/**
 * Power and Heart Rate zone definitions.
 *
 * Canonical source — DO NOT redefine zones inline anywhere else.
 * Import `POWER_ZONES`, `HR_ZONES`, `getPowerZone`, `getHrZone` from here.
 *
 * Power zones follow Coggan model (5-zone MVP simplification; Z6-Z7 collapsed into Z5).
 * HR zones follow %-of-MaxHR (simpler and matches stored athlete.max_hr).
 */

export type PowerZoneId = 'z1' | 'z2' | 'z3' | 'z4' | 'z5';
export type HrZoneId    = 'z1' | 'z2' | 'z3' | 'z4' | 'z5';

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
 * Heart Rate zones based on %-of-MaxHR.
 * `max` is the upper bound as a fraction of MaxHR.
 */
export const HR_ZONES: readonly HrZone[] = [
  { id: 'z1', label: 'Z1', name: 'Recuperação', color: 'oklch(0.5 0.05 250)',  max: 0.60 },
  { id: 'z2', label: 'Z2', name: 'Aeróbico',    color: 'oklch(0.7 0.14 180)',  max: 0.70 },
  { id: 'z3', label: 'Z3', name: 'Tempo',       color: 'oklch(0.78 0.18 60)',  max: 0.80 },
  { id: 'z4', label: 'Z4', name: 'Limiar',      color: 'oklch(0.7 0.2 340)',   max: 0.90 },
  { id: 'z5', label: 'Z5', name: 'Máximo',      color: 'oklch(0.65 0.22 25)',  max: 99   },
] as const;

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
 */
export function getHrZone(hr: number, maxHr: number): HrZone {
  if (maxHr <= 0) return HR_ZONES[0];
  const pct = hr / maxHr;
  return HR_ZONES.find(z => pct < z.max) ?? HR_ZONES[HR_ZONES.length - 1];
}
