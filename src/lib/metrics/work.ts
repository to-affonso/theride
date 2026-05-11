/**
 * Work and energy.
 *
 *   kJ = avgPower × seconds / 1000      (mechanical work delivered to the cranks)
 *   kcal = kJ / efficiency / 4.184      (metabolic energy the body expended)
 *
 * Standard assumption: ~22% efficiency converting metabolic energy to mechanical
 * (well-documented in cycling physiology literature).
 *
 * Convenient shortcut: kcal ≈ kJ × 1.087 — used inline in BLE callbacks where
 * we can't afford a full conversion per sample.
 */

const EFFICIENCY = 0.22;
const KJ_PER_KCAL = 4.184;

/**
 * Mechanical work in kilojoules.
 */
export function kjWork(avgPower: number, durationSeconds: number): number {
  return Math.round(avgPower * durationSeconds / 1000);
}

/**
 * Total caloric expenditure (kcal), accounting for cycling efficiency.
 */
export function calories(avgPower: number, durationSeconds: number): number {
  const mechanicalKj = avgPower * durationSeconds / 1000;
  const metabolicKj  = mechanicalKj / EFFICIENCY;
  return Math.round(metabolicKj / KJ_PER_KCAL);
}

/**
 * Incremental kcal for a single sample of power.
 * Used in real-time accumulation (e.g. BLE callbacks at 1Hz).
 *
 *   1 W for 1 s = 1 J mechanical
 *   = (1 / 0.22) J metabolic
 *   = (1 / 0.22 / 4184) kcal
 */
export function caloriesIncrement(powerW: number): number {
  return powerW / EFFICIENCY / (KJ_PER_KCAL * 1000);
}
