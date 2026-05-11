/**
 * Aerobic Decoupling (Pa:Hr).
 *
 * Measures whether your heart rate drifted upward relative to your power
 * (or pace) over the course of a steady-state ride.
 *
 * Algorithm:
 *   1. Split ride into first half and second half.
 *   2. Compute mean(power) / mean(HR) for each half.
 *   3. Decoupling = (ratioFirst − ratioSecond) / ratioFirst × 100  (as %).
 *
 * Positive decoupling = HR drifted up while power stayed flat → aerobic fatigue,
 * dehydration, or weak base. Negative = HR dropped (rare, suggests early-ride spike).
 *
 * Interpretation (per Friel):
 *   < 5%   — strong aerobic base / well-paced
 *   5–8%   — acceptable for tempo / threshold ride
 *   8–10%  — borderline; consider hydration, fueling, fitness
 *   > 10%  — significant decoupling; rest or weakness
 *
 * Only meaningful for steady-state rides (Z2/Z3) over 30+ minutes.
 * For interval workouts, decoupling is uninformative.
 */

/**
 * @param power 1Hz power samples (W). Length must match `hr`.
 * @param hr 1Hz HR samples (bpm). Length must match `power`.
 * @returns Decoupling as a percentage (e.g. 3.2 = 3.2%). Returns 0 if too short.
 */
export function decoupling(power: number[], hr: number[]): number {
  const len = Math.min(power.length, hr.length);
  if (len < 60) return 0; // Less than 1min — not meaningful

  const mid = Math.floor(len / 2);

  const firstPower = mean(power.slice(0, mid));
  const firstHr    = mean(hr.slice(0, mid));
  const secondPower = mean(power.slice(mid, len));
  const secondHr    = mean(hr.slice(mid, len));

  if (firstHr <= 0 || secondHr <= 0) return 0;

  const ratioFirst  = firstPower  / firstHr;
  const ratioSecond = secondPower / secondHr;

  if (ratioFirst <= 0) return 0;

  return ((ratioFirst - ratioSecond) / ratioFirst) * 100;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}
