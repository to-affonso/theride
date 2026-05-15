/**
 * Comparison helpers — compare a session against the athlete's history.
 *
 * Used by the post-ride and history-detail views to surface:
 *   - "↑ XW vs your last attempt of this route"
 *   - "⭐ New PR at 5min: 312W (+8W)"
 */

import { Session } from '@/types';
import { findPrs, type BestPower, type MmpKey } from './metrics';

/**
 * Most recent prior attempt on the same route by the same athlete.
 * Returns `null` if no prior attempt exists or `routeId` is null (free session).
 *
 * Caller should pass the FULL list of athlete sessions (will filter & sort here).
 */
export function findLastAttempt(
  candidates: Session[],
  currentSessionId: string,
  routeId: string | null,
): Session | null {
  if (!routeId) return null;
  const prior = candidates
    .filter(s => s.id !== currentSessionId && s.route_id === routeId)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  return prior[0] ?? null;
}

/**
 * All-time best per MMP window across the given sessions.
 * Pass `excludeSessionId` to compute the historical best EXCLUDING the
 * current session (used for PR detection — current must beat historical).
 */
export function aggregateHistoricalBest(
  sessions: Session[],
  excludeSessionId?: string,
): BestPower {
  const result: BestPower = {};
  const keys: MmpKey[] = ['5s', '30s', '1min', '5min', '20min', '60min'];
  for (const s of sessions) {
    if (s.id === excludeSessionId) continue;
    const bp = s.best_power;
    if (!bp) continue;
    for (const k of keys) {
      const v = bp[k];
      if (v === undefined) continue;
      const current = result[k] ?? 0;
      if (v > current) result[k] = v;
    }
  }
  return result;
}

/**
 * Detect which MMP windows are PRs for `current` vs `historicalBest`.
 */
export function detectPrs(
  current: BestPower | null | undefined,
  historicalBest: BestPower,
): MmpKey[] {
  if (!current) return [];
  return findPrs(current, historicalBest);
}

/**
 * Compute delta values for PRs (how much each PR exceeds the historical best).
 */
export function prDeltasOf(
  current: BestPower | null | undefined,
  historicalBest: BestPower,
  prs: MmpKey[],
): Partial<Record<MmpKey, number>> {
  if (!current) return {};
  const deltas: Partial<Record<MmpKey, number>> = {};
  for (const k of prs) {
    const c = current[k];
    if (c === undefined) continue;
    deltas[k] = c - (historicalBest[k] ?? 0);
  }
  return deltas;
}

export type PrKind = 'first' | 'improved';

/**
 * Classify each PR window as a first-ever record vs an improvement over
 * an existing historical best. Crucial early in an athlete's history when
 * everything is "first" — surfacing a misleading "+135W" delta on a window
 * that had no prior record would be wrong framing.
 */
export function classifyPrs(
  historicalBest: BestPower,
  prs: MmpKey[],
): Partial<Record<MmpKey, PrKind>> {
  const out: Partial<Record<MmpKey, PrKind>> = {};
  for (const k of prs) {
    out[k] = (historicalBest[k] ?? 0) > 0 ? 'improved' : 'first';
  }
  return out;
}

/**
 * Compare two sessions on the same route.
 */
export interface ComparisonResult {
  hasComparison: boolean;
  npDelta?: number;
  avgPowerDelta?: number;
  durationDelta?: number;
  tssDelta?: number;
  prevDate?: string;
  prevAttemptId?: string;
}

export function compareToLast(current: Session, last: Session | null): ComparisonResult {
  if (!last) return { hasComparison: false };
  const currentNp = current.normalized_power ?? current.avg_power;
  const lastNp    = last.normalized_power    ?? last.avg_power;
  return {
    hasComparison: true,
    npDelta:       currentNp - lastNp,
    avgPowerDelta: current.avg_power - last.avg_power,
    durationDelta: current.duration_s - last.duration_s,
    tssDelta:      current.tss - last.tss,
    prevDate:      last.started_at,
    prevAttemptId: last.id,
  };
}

/**
 * Build a single human-readable highlight line from comparison + PRs.
 * Picks the most impactful signal to display front-and-center on the hero.
 *
 * Priority order:
 *   1. New PR (most exciting)
 *   2. NP improvement vs last attempt
 *   3. TSS or time improvement
 *   4. (nothing — return null)
 */
export function buildHighlight(
  comparison: ComparisonResult,
  prs: MmpKey[],
  prDeltas: Partial<Record<MmpKey, number>>,
  prKinds: Partial<Record<MmpKey, PrKind>> = {},
): string | null {
  if (prs.length > 0) {
    // Prefer surfacing an "improved" PR over a "first" one — improvements
    // are more meaningful as a headline.
    const top = prs.find(k => prKinds[k] === 'improved') ?? prs[0];
    const kind = prKinds[top] ?? 'first';
    const delta = prDeltas[top];
    const label = labelOfMmp(top);
    if (kind === 'first') return `Primeiro registro de ${label}`;
    if (delta !== undefined && delta > 0) return `Novo PR de ${label} (+${delta}W)`;
    return `Novo PR de ${label}`;
  }
  if (comparison.hasComparison && comparison.npDelta !== undefined) {
    if (comparison.npDelta > 4)       return `↑ ${Math.round(comparison.npDelta)}W melhor que sua última tentativa`;
    if (comparison.npDelta < -4)      return `↓ ${Math.round(Math.abs(comparison.npDelta))}W abaixo da última tentativa`;
    if (Math.abs(comparison.npDelta) <= 4) return `↔ Consistente com sua última tentativa`;
  }
  return null;
}

function labelOfMmp(k: MmpKey): string {
  switch (k) {
    case '5s':    return '5s';
    case '30s':   return '30s';
    case '1min':  return '1 min';
    case '5min':  return '5 min';
    case '20min': return '20 min';
    case '60min': return '1 h';
  }
}
