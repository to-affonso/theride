/**
 * Compute age in full years from a birth date string ("YYYY-MM-DD") or
 * Date instance. Returns null when the input is missing or unparseable.
 *
 * Uses local-date arithmetic; off-by-one timezone issues are avoided by
 * parsing the YYYY-MM-DD parts manually when given a string.
 */
export function ageFromBirthDate(input?: string | Date | null, now: Date = new Date()): number | null {
  if (!input) return null;

  let y: number, m: number, d: number;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    y = input.getFullYear(); m = input.getMonth() + 1; d = input.getDate();
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
    if (!match) return null;
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
  }

  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();

  let age = todayY - y;
  if (todayM < m || (todayM === m && todayD < d)) age--;
  return age >= 0 ? age : null;
}
