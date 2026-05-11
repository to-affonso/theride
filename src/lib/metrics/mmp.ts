/**
 * Mean Max Power (MMP) — Power Duration Curve.
 *
 * For each duration window, find the maximum average power that the athlete
 * sustained for that window during the ride. The set of best averages across
 * windows forms the "power curve" — the canonical performance profile.
 *
 * Algorithm: sliding window with running sum (O(n) per window).
 *
 * MMP at common durations is the basis for FTP estimation, segment PRs, and
 * comparison with historical bests.
 */

export const MMP_WINDOWS_SECONDS = [5, 30, 60, 300, 1200, 3600] as const;

export type MmpKey = '5s' | '30s' | '1min' | '5min' | '20min' | '60min';

export type BestPower = Partial<Record<MmpKey, number>>;

function mmpKey(seconds: number): MmpKey {
  switch (seconds) {
    case 5:    return '5s';
    case 30:   return '30s';
    case 60:   return '1min';
    case 300:  return '5min';
    case 1200: return '20min';
    case 3600: return '60min';
    default:   throw new Error(`Unsupported MMP window: ${seconds}s`);
  }
}

/**
 * Compute the maximum rolling-average power for each window in `windowsSeconds`.
 *
 * @param power 1Hz power samples (W).
 * @param windowsSeconds Window sizes to compute. Defaults to standard set.
 * @returns Object with keys "5s", "1min", etc. Missing if series too short.
 */
export function meanMaxPower(
  power: number[],
  windowsSeconds: readonly number[] = MMP_WINDOWS_SECONDS,
): BestPower {
  const result: BestPower = {};

  for (const w of windowsSeconds) {
    if (power.length < w) continue;

    // Sliding window — compute first window, then slide
    let windowSum = 0;
    for (let i = 0; i < w; i++) windowSum += power[i];

    let bestSum = windowSum;
    for (let i = w; i < power.length; i++) {
      windowSum += power[i] - power[i - w];
      if (windowSum > bestSum) bestSum = windowSum;
    }

    result[mmpKey(w)] = Math.round(bestSum / w);
  }

  return result;
}

/**
 * Estimate FTP from MMP. Two common methods:
 *   - From a 20-min all-out test: FTP ≈ 0.95 × best 20min
 *   - From a 60-min ride at threshold: FTP ≈ best 60min
 *
 * Returns the higher of the two estimates (more conservative for casual rides).
 * Returns 0 if not enough data.
 */
export function estimateFtpFromMmp(mmp: BestPower): number {
  const from20 = mmp['20min'] ? Math.round(mmp['20min'] * 0.95) : 0;
  const from60 = mmp['60min'] ?? 0;
  return Math.max(from20, from60);
}

/**
 * Identify which durations are new PRs compared to a historical baseline.
 * Used in post-ride summary to highlight badges.
 */
export function findPrs(current: BestPower, historical: BestPower): MmpKey[] {
  const prs: MmpKey[] = [];
  for (const key of Object.keys(current) as MmpKey[]) {
    const c = current[key];
    const h = historical[key] ?? 0;
    if (c !== undefined && c > h) prs.push(key);
  }
  return prs;
}
