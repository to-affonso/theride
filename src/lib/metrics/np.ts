/**
 * Normalized Power (NP) — Coggan.
 *
 * NP estimates the metabolically equivalent steady power for a variable effort.
 * Algorithm (canonical):
 *   1. Compute a 30-second rolling average of power.
 *   2. Raise each rolling-average value to the 4th power.
 *   3. Take the mean of those values.
 *   4. Take the 4th root.
 *
 * Why 4th power: physiological cost rises roughly with the 4th power of intensity,
 * so spikes count disproportionately more than steady effort.
 *
 * For series shorter than 30 samples, falls back to simple mean (NP ≈ AP).
 */

const WINDOW_SECONDS = 30;

/**
 * @param power 1Hz power samples (W). May include zeros (coasting is real).
 * @returns NP in watts, rounded to nearest integer.
 */
export function normalizedPower(power: number[]): number {
  if (power.length === 0) return 0;

  // Short series: NP ≈ average
  if (power.length < WINDOW_SECONDS) {
    const sum = power.reduce((a, b) => a + b, 0);
    return Math.round(sum / power.length);
  }

  // 1. 30s rolling average using sliding window
  const rolling: number[] = [];
  let windowSum = 0;
  for (let i = 0; i < power.length; i++) {
    windowSum += power[i];
    if (i >= WINDOW_SECONDS) windowSum -= power[i - WINDOW_SECONDS];
    if (i >= WINDOW_SECONDS - 1) rolling.push(windowSum / WINDOW_SECONDS);
  }

  // 2-4. Mean of 4th powers, then 4th root
  let sumOfFourthPowers = 0;
  for (const v of rolling) sumOfFourthPowers += v * v * v * v;
  const meanOfFourthPowers = sumOfFourthPowers / rolling.length;

  return Math.round(Math.pow(meanOfFourthPowers, 0.25));
}
