/**
 * Shared formatters — dates, durations, numbers.
 * Used across history, summary, dashboard.
 */

/** "1h47" / "45min" / "12s" */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** "01:32:45" or "32:45" */
export function formatClock(seconds: number): string {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return seconds >= 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "09 mai · qua" (relative date for history list) */
export function formatDateLong(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
  const weekday = d.toLocaleString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${day} ${month} · ${weekday}`;
}

/** "09 mai · 21:00" */
export function formatDateTime(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} · ${hh}:${mm}`;
}

/** "hoje" / "ontem" / "há 3 dias" / "há 2 semanas" */
export function formatRelative(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'hoje';
  if (diffDays === 1) return 'ontem';
  if (diffDays < 7) return `há ${diffDays} dias`;
  if (diffDays < 14) return 'há 1 semana';
  if (diffDays < 30) return `há ${Math.floor(diffDays / 7)} semanas`;
  if (diffDays < 60) return 'há 1 mês';
  if (diffDays < 365) return `há ${Math.floor(diffDays / 30)} meses`;
  return `há ${Math.floor(diffDays / 365)} ano(s)`;
}

/** YYYY-MM-DD key for grouping sessions by day */
export function dayKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return d.toISOString().slice(0, 10);
}

/** "1.234" / "12.5k" / "1.2M" — compact for large numbers like kJ totals */
export function formatCompact(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 10000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  if (n < 1_000_000) return Math.round(n / 1000) + 'k';
  return (n / 1_000_000).toFixed(1).replace('.', ',') + 'M';
}

/** Period buckets used in history filters. */
export type PeriodKey = '7d' | '30d' | '3m' | '6m' | '1y' | 'all';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '7d':  '7 dias',
  '30d': '30 dias',
  '3m':  '3 meses',
  '6m':  '6 meses',
  '1y':  '1 ano',
  'all': 'Tudo',
};

/** Return the start Date for a period bucket, or null for 'all'. */
export function periodStart(key: PeriodKey): Date | null {
  const now = new Date();
  const d = new Date(now);
  switch (key) {
    case '7d':  d.setDate(now.getDate() - 7);   return d;
    case '30d': d.setDate(now.getDate() - 30);  return d;
    case '3m':  d.setMonth(now.getMonth() - 3); return d;
    case '6m':  d.setMonth(now.getMonth() - 6); return d;
    case '1y':  d.setFullYear(now.getFullYear() - 1); return d;
    case 'all': return null;
  }
}
