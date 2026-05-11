/**
 * Intensity Factor (IF) — Coggan.
 *
 * Ratio of how hard the workout was relative to FTP.
 *   IF = NP / FTP
 *
 * Interpretation:
 *   < 0.75 — recovery / endurance
 *   0.75–0.85 — tempo
 *   0.85–0.95 — sweet-spot / threshold work
 *   0.95–1.05 — near-FTP race effort (1h time trial)
 *   > 1.05 — VO2-max intervals (short)
 *
 * IF = 1.0 means the entire workout was at FTP, which is by definition
 * a max-sustainable 1-hour effort.
 */

export function intensityFactor(np: number, ftp: number): number {
  if (ftp <= 0) return 0;
  return np / ftp;
}
