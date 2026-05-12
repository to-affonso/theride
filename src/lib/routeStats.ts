/**
 * Route-level usage stats derived from the `sessions` table.
 *
 * Used by the route-selection list to surface:
 *   - "Última: 1h47" indicator if the route has been ridden
 *   - "Já feita" filter
 *   - "Mais usadas" sort
 */

import { createClient } from '@/lib/supabase/client';

export interface RouteStats {
  /** Number of sessions logged for this route_id. */
  count:    number;
  /** ISO timestamp of the most recent session on this route. */
  lastAt:   string | null;
  /** Best (fastest) duration in seconds across all sessions on this route. */
  bestDurationS: number | null;
}

/**
 * Fetch usage stats for the current user, grouped by route_id.
 * Returns a Record so callers can do O(1) lookups.
 */
export async function loadRouteStats(athleteId: string): Promise<Record<string, RouteStats>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sessions')
    .select('route_id, started_at, duration_s')
    .eq('athlete_id', athleteId)
    .not('route_id', 'is', null);

  if (error || !data) return {};

  const stats: Record<string, RouteStats> = {};
  for (const row of data as Array<{ route_id: string | null; started_at: string; duration_s: number }>) {
    if (!row.route_id) continue;
    const cur = stats[row.route_id] ?? { count: 0, lastAt: null, bestDurationS: null };
    cur.count += 1;
    if (!cur.lastAt || row.started_at > cur.lastAt) cur.lastAt = row.started_at;
    if (row.duration_s > 0) {
      cur.bestDurationS = cur.bestDurationS == null
        ? row.duration_s
        : Math.min(cur.bestDurationS, row.duration_s);
    }
    stats[row.route_id] = cur;
  }
  return stats;
}

/** Format a duration in seconds as "Xh YYmin" (or "Y min" if < 1 h). */
export function formatDurationShort(s: number): string {
  if (s <= 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0)   return `${m} min`;
  return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
}
