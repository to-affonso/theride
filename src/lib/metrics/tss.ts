/**
 * Training Stress Score (TSS) — Coggan.
 *
 * Single-number summary of workout load combining intensity and duration.
 *   TSS = (seconds × NP × IF) / (FTP × 3600) × 100
 *       = hours × IF² × 100
 *
 * Reference points:
 *   100 TSS = 1 hour at FTP exactly (race-like 1h effort).
 *
 * Heuristic ranges (per session):
 *   < 50    — recovery
 *   50–100  — moderate
 *   100–150 — moderate-hard
 *   150–250 — hard
 *   250–400 — epic
 *   > 400   — extreme
 */

export interface TssClassification {
  level: 'recovery' | 'moderate' | 'moderate-hard' | 'hard' | 'epic' | 'extreme';
  label: string;
  recoveryHoursMin: number;
  recoveryHoursMax: number;
}

export function trainingStressScore(
  durationSeconds: number,
  np: number,
  ftp: number,
): number {
  if (ftp <= 0 || durationSeconds <= 0) return 0;
  const iF = np / ftp;
  const durationHours = durationSeconds / 3600;
  return Math.round(durationHours * iF * iF * 100);
}

/**
 * Return a human-readable classification and recovery estimate for a TSS value.
 * Used in post-ride summary narrative.
 */
export function classifyTss(tss: number): TssClassification {
  if (tss < 50)  return { level: 'recovery',      label: 'Recuperação leve',    recoveryHoursMin: 0,  recoveryHoursMax: 12 };
  if (tss < 100) return { level: 'moderate',      label: 'Treino moderado',     recoveryHoursMin: 12, recoveryHoursMax: 36 };
  if (tss < 150) return { level: 'moderate-hard', label: 'Treino moderado-alto', recoveryHoursMin: 36, recoveryHoursMax: 48 };
  if (tss < 250) return { level: 'hard',          label: 'Treino intenso',       recoveryHoursMin: 48, recoveryHoursMax: 72 };
  if (tss < 400) return { level: 'epic',          label: 'Treino épico',         recoveryHoursMin: 72, recoveryHoursMax: 96 };
  return                  { level: 'extreme',     label: 'Esforço extremo',      recoveryHoursMin: 96, recoveryHoursMax: 168 };
}
