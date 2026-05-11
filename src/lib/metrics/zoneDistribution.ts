/**
 * Time-in-zone distribution.
 *
 * Counts how many samples (typically 1Hz = seconds) fell into each zone.
 * Output keys match `PowerZoneId` / `HrZoneId` from `src/lib/zones.ts`.
 */

import { POWER_ZONES, HR_ZONES, getPowerZone, getHrZone, PowerZoneId, HrZoneId } from '../zones';

export type PowerZoneSeconds = Record<PowerZoneId, number>;
export type HrZoneSeconds    = Record<HrZoneId, number>;

/**
 * Distribution of seconds spent in each power zone.
 * Assumes `power` is 1Hz; each sample contributes 1 second to its zone.
 */
export function powerZoneDistribution(power: number[], ftp: number): PowerZoneSeconds {
  const result = {} as PowerZoneSeconds;
  for (const z of POWER_ZONES) result[z.id] = 0;

  if (ftp <= 0) return result;

  for (const p of power) {
    const zone = getPowerZone(p, ftp);
    result[zone.id]++;
  }

  return result;
}

/**
 * Distribution of seconds spent in each HR zone.
 * Assumes `hr` is 1Hz.
 */
export function hrZoneDistribution(hr: number[], maxHr: number): HrZoneSeconds {
  const result = {} as HrZoneSeconds;
  for (const z of HR_ZONES) result[z.id] = 0;

  if (maxHr <= 0) return result;

  for (const h of hr) {
    const zone = getHrZone(h, maxHr);
    result[zone.id]++;
  }

  return result;
}

/**
 * Return the zone id with the most time. Useful for "dominant zone" badge.
 */
export function dominantPowerZone(distribution: PowerZoneSeconds): PowerZoneId {
  let bestId: PowerZoneId = 'z1';
  let bestSec = -1;
  for (const z of POWER_ZONES) {
    if (distribution[z.id] > bestSec) {
      bestSec = distribution[z.id];
      bestId = z.id;
    }
  }
  return bestId;
}
