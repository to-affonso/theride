/**
 * Variability Index (VI).
 *
 *   VI = NP / avgPower
 *
 * Interpretation:
 *   1.00 — perfectly steady effort (e.g. flat TT, ERG-mode interval)
 *   1.00–1.05 — base / endurance ride
 *   1.05–1.10 — undulating terrain or moderate intervals
 *   > 1.10 — surgy / variable (race, attacks, hilly route)
 *
 * Used as a coaching signal: high VI on a "steady" workout = poor pacing.
 * Low VI on an interval workout = under-delivering on intervals.
 */

export function variabilityIndex(np: number, avgPower: number): number {
  if (avgPower <= 0) return 1;
  return np / avgPower;
}
