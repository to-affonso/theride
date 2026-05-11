/**
 * Deterministic insight rules — translate raw metrics into human-readable
 * coaching observations. Top 3-5 most relevant are shown on the post-ride
 * and history-detail screens.
 *
 * Rules are pure functions of session data and athlete state. No LLM,
 * no API calls. Predictable and testable.
 */

import { Session } from '@/types';
import { decoupling } from './metrics/decoupling';
import type { MmpKey } from './metrics';

export type InsightVariant = 'positive' | 'neutral' | 'caution';
export type InsightIconKind = 'trophy' | 'check' | 'info' | 'alert';

export interface Insight {
  id: string;
  variant: InsightVariant;
  text: string;
  /** Overrides the variant's default icon (e.g. trophy for PRs). */
  icon?: InsightIconKind;
  priority: number; // higher = shown first
}

export interface InsightContext {
  session: Session;
  /** MMP windows where this session set a new PR (see comparison.detectPrs). */
  prs?: MmpKey[];
  /** Deltas (in W) for each PR vs historical best. */
  prDeltas?: Partial<Record<MmpKey, number>>;
}

const MAX_INSIGHTS = 5;

/**
 * Generate insights from a session. Returns top-N by priority.
 */
export function generateInsights(ctx: InsightContext): Insight[] {
  const { session, prs = [], prDeltas = {} } = ctx;
  const out: Insight[] = [];

  const ftp = session.ftp_at_time ?? 0;
  const np  = session.normalized_power ?? session.avg_power;
  const iF  = session.intensity_factor ?? (ftp > 0 ? np / ftp : 0);
  const vi  = session.variability_index ?? 0;
  const tss = session.tss;
  const durationMin = session.duration_s / 60;
  const totalSec    = session.duration_s || 1;

  const z2 = session.power_zone_seconds?.z2 ?? 0;
  const z3 = session.power_zone_seconds?.z3 ?? 0;
  const z4 = session.power_zone_seconds?.z4 ?? 0;
  const z5 = session.power_zone_seconds?.z5 ?? 0;

  // ── PRs (highest priority) ─────────────────────────────────────────────
  for (const k of prs) {
    const delta = prDeltas[k];
    const value = session.best_power?.[k];
    const label = labelOfMmp(k);
    out.push({
      id: `pr-${k}`,
      variant: 'positive',
      icon: 'trophy',
      text: delta !== undefined && delta > 0
        ? `Novo PR de ${label}: ${value}W (+${delta}W vs seu melhor anterior).`
        : `Novo PR de ${label}: ${value}W.`,
      priority: 100,
    });
  }

  // ── Power zone observations ────────────────────────────────────────────
  if (z4 > 20 * 60) {
    out.push({
      id: 'z4-stimulus',
      variant: 'positive',
      text: `Você passou ${Math.floor(z4 / 60)}min em Z4 — bom estímulo de FTP.`,
      priority: 80,
    });
  }

  if (z2 / totalSec > 0.60 && totalSec > 30 * 60) {
    out.push({
      id: 'z2-base',
      variant: 'positive',
      text: `Treino majoritariamente em Z2 (${Math.round(z2 / totalSec * 100)}%) — boa base aeróbica.`,
      priority: 60,
    });
  }

  if (z5 > 10 * 60) {
    out.push({
      id: 'z5-vo2',
      variant: 'positive',
      text: `${Math.floor(z5 / 60)}min em Z5 — estímulo forte de VO₂ máx.`,
      priority: 75,
    });
  }

  // ── Aerobic decoupling (only meaningful for long-ish rides) ────────────
  if (durationMin >= 30 && session.power_series.length > 60 && session.hr_series.length > 60) {
    const dec = decoupling(session.power_series, session.hr_series);
    if (dec > 8) {
      out.push({
        id: 'decoupling-high',
        variant: 'caution',
        text: `Decoupling de ${dec.toFixed(1)}% — sinal de fadiga aeróbica. Considere mais hidratação ou treinos mais curtos por enquanto.`,
        priority: 70,
      });
    } else if (dec >= 0 && dec < 3 && durationMin >= 45) {
      out.push({
        id: 'decoupling-low',
        variant: 'positive',
        text: `Decoupling baixo (${dec.toFixed(1)}%) — você está aerobicamente sólido para esta intensidade.`,
        priority: 65,
      });
    }
  }

  // ── Variability Index ──────────────────────────────────────────────────
  if (vi > 1.10) {
    out.push({
      id: 'vi-high',
      variant: 'neutral',
      text: `Esforço variável (VI ${vi.toFixed(2)}) — perfil de treino intervalado ou race.`,
      priority: 50,
    });
  } else if (vi > 0 && vi < 1.05 && durationMin >= 30) {
    out.push({
      id: 'vi-steady',
      variant: 'positive',
      text: `Esforço estável (VI ${vi.toFixed(2)}) — pacing ideal para treino de base.`,
      priority: 45,
    });
  }

  // ── Intensity ──────────────────────────────────────────────────────────
  if (iF >= 0.95 && tss >= 80) {
    out.push({
      id: 'if-very-high',
      variant: 'caution',
      text: `IF ${iF.toFixed(2)} — esforço muito próximo do máximo sustentável. Espere 48-72h de recuperação.`,
      priority: 85,
    });
  }

  // ── Cadence on climbs (placeholder — needs gradient_series + cadence sync) ─
  // Sprint 2B will add this when we wire up gradient-aligned analysis.

  // ── Sort by priority desc, limit ───────────────────────────────────────
  out.sort((a, b) => b.priority - a.priority);
  return out.slice(0, MAX_INSIGHTS);
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
