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
import { totalElevationGain } from './gpx';
import type { MmpKey } from './metrics';
import type { PrKind } from './comparison';

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
  /** First-record vs improved-PR classification. */
  prKinds?: Partial<Record<MmpKey, PrKind>>;
}

const MAX_INSIGHTS = 6;

/**
 * Generate insights from a session. Returns top-N by priority.
 */
export function generateInsights(ctx: InsightContext): Insight[] {
  const { session, prs = [], prDeltas = {}, prKinds = {} } = ctx;
  const out: Insight[] = [];

  const ftp = session.ftp_at_time ?? 0;
  const np  = session.normalized_power ?? session.avg_power;
  const iF  = session.intensity_factor ?? (ftp > 0 ? np / ftp : 0);
  const vi  = session.variability_index ?? 0;
  const tss = session.tss;
  const durationMin = session.duration_s / 60;
  const totalSec    = session.duration_s || 1;

  const z1 = session.power_zone_seconds?.z1 ?? 0;
  const z2 = session.power_zone_seconds?.z2 ?? 0;
  const z3 = session.power_zone_seconds?.z3 ?? 0;
  const z4 = session.power_zone_seconds?.z4 ?? 0;
  const z5 = session.power_zone_seconds?.z5 ?? 0;

  // ── PRs (highest priority) — only "improved" earn the trophy + +delta framing ─
  for (const k of prs) {
    const kind  = prKinds[k] ?? 'first';
    const delta = prDeltas[k];
    const value = session.best_power?.[k];
    const label = labelOfMmp(k);
    if (kind === 'improved') {
      out.push({
        id: `pr-${k}`,
        variant: 'positive',
        icon: 'trophy',
        text: delta !== undefined && delta > 0
          ? `Novo PR de ${label}: ${value}W (+${delta}W vs seu melhor anterior).`
          : `Novo PR de ${label}: ${value}W.`,
        priority: 100,
      });
    } else {
      out.push({
        id: `first-${k}`,
        variant: 'neutral',
        icon: 'info',
        text: `Primeiro registro de ${label}: ${value}W — virou seu baseline para essa janela.`,
        priority: 55,
      });
    }
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

  // ── Cadence quality ────────────────────────────────────────────────────
  const avgCad = avgNonZero(session.cadence_series ?? []);
  if (avgCad > 0 && durationMin >= 15) {
    if (avgCad < 70) {
      out.push({
        id: 'cadence-low',
        variant: 'caution',
        text: `Cadência média ${avgCad} rpm — baixa para endurance. Pedalar mais leve (80-90 rpm) reduz carga muscular.`,
        priority: 40,
      });
    } else if (avgCad >= 80 && avgCad <= 95) {
      out.push({
        id: 'cadence-good',
        variant: 'positive',
        text: `Cadência média ${avgCad} rpm — faixa ideal para eficiência aeróbica.`,
        priority: 35,
      });
    } else if (avgCad > 100) {
      out.push({
        id: 'cadence-high',
        variant: 'neutral',
        text: `Cadência média ${avgCad} rpm — alta, característica de treino em marcha leve ou spin.`,
        priority: 35,
      });
    }
  }

  // ── Dominant zone (only when none of the specific Z3/Z4/Z5 rules fired) ─
  const dominant = dominantPowerZone({ z1, z2, z3, z4, z5 });
  if (dominant && durationMin >= 20 && !out.some(o => o.id.startsWith('z') && o.id !== 'z2-base')) {
    const pct = Math.round((dominant.sec / totalSec) * 100);
    if (dominant.id === 'z1' && pct > 50) {
      out.push({
        id: 'z1-dominant',
        variant: 'neutral',
        text: `${pct}% do tempo em Z1 — sessão regenerativa, baixo impacto na fadiga.`,
        priority: 30,
      });
    }
  }

  // ── Longest sustained effort above target threshold ────────────────────
  if (ftp > 0 && session.power_series.length > 60) {
    const target = Math.round(ftp * 0.85); // tempo+ pace
    const best = longestSustainedAbove(session.power_series, target, 30);
    if (best.durationSec >= 60) {
      out.push({
        id: 'sustained-effort',
        variant: 'positive',
        text: `Maior bloco sustentado acima de ${target}W: ${formatMinSec(best.durationSec)} (média ${Math.round(best.avgPower)}W).`,
        priority: 48,
      });
    }
  }

  // ── HR drift in plain language (separate from numeric decoupling above) ─
  if (durationMin >= 45 && session.power_series.length > 60 && session.hr_series.length > 60) {
    const drift = hrDriftBpm(session.power_series, session.hr_series);
    if (drift >= 6) {
      out.push({
        id: 'hr-drift',
        variant: 'caution',
        text: `Sua FC subiu ~${drift}bpm na segunda metade mantendo potência parecida — sinal de fadiga ou hidratação insuficiente.`,
        priority: 58,
      });
    }
  }

  // ── Long-ride milestone ────────────────────────────────────────────────
  if (durationMin >= 120) {
    out.push({
      id: 'long-ride',
      variant: 'positive',
      text: `Treino longo (${Math.floor(durationMin)}min) — bom estímulo para resistência. Priorize hidratação e ingestão de carboidrato (60-90g/h).`,
      priority: 42,
    });
  }

  // ── Significant climbing (when route GPX is attached) ──────────────────
  const gpxPoints = session.routes?.gpx_data?.points;
  if (gpxPoints && gpxPoints.length > 1) {
    const ascent = totalElevationGain(gpxPoints);
    if (ascent >= 800) {
      out.push({
        id: 'big-climb',
        variant: 'positive',
        text: `${ascent}m de ganho de elevação — treino de subida significativo.`,
        priority: 52,
      });
    } else if (ascent >= 300) {
      out.push({
        id: 'mixed-terrain',
        variant: 'neutral',
        text: `${ascent}m de ganho de elevação — terreno misto.`,
        priority: 28,
      });
    }
  }

  // ── Sort by priority desc, limit ───────────────────────────────────────
  out.sort((a, b) => b.priority - a.priority);
  return out.slice(0, MAX_INSIGHTS);
}

// ── Helpers ────────────────────────────────────────────────────────────

function avgNonZero(arr: number[]): number {
  let s = 0, n = 0;
  for (const v of arr) if (v > 0) { s += v; n++; }
  return n > 0 ? Math.round(s / n) : 0;
}

function dominantPowerZone(zones: { z1: number; z2: number; z3: number; z4: number; z5: number }) {
  let bestId: 'z1'|'z2'|'z3'|'z4'|'z5' = 'z1';
  let bestSec = -1;
  for (const id of ['z1','z2','z3','z4','z5'] as const) {
    if (zones[id] > bestSec) { bestSec = zones[id]; bestId = id; }
  }
  return bestSec > 0 ? { id: bestId, sec: bestSec } : null;
}

/**
 * Longest contiguous run where smoothed power stays above `target`.
 * Allows short dips (< gapTolerance samples below target) before breaking the run.
 */
function longestSustainedAbove(power: number[], target: number, gapTolerance: number): { durationSec: number; avgPower: number } {
  let bestLen = 0, bestSum = 0;
  let curStart = -1, curSum = 0, curBelow = 0;
  for (let i = 0; i < power.length; i++) {
    const v = power[i];
    if (v >= target) {
      if (curStart === -1) { curStart = i; curSum = 0; curBelow = 0; }
      curSum += v;
      curBelow = 0;
    } else {
      if (curStart !== -1) {
        curBelow++;
        curSum += v;
        if (curBelow > gapTolerance) {
          const len = i - curStart - curBelow;
          if (len > bestLen) { bestLen = len; bestSum = curSum - v * curBelow; }
          curStart = -1; curSum = 0; curBelow = 0;
        }
      }
    }
  }
  if (curStart !== -1) {
    const len = power.length - curStart - curBelow;
    if (len > bestLen) { bestLen = len; bestSum = curSum; }
  }
  return { durationSec: bestLen, avgPower: bestLen > 0 ? bestSum / bestLen : 0 };
}

/**
 * Estimated HR drift = avg HR in second half minus avg HR in first half,
 * but only counted when power was similar in both halves (within 5%).
 * Returns 0 if power differential was too large to attribute drift to fatigue.
 */
function hrDriftBpm(power: number[], hr: number[]): number {
  const n = Math.min(power.length, hr.length);
  if (n < 120) return 0;
  const mid = Math.floor(n / 2);
  const meanRange = (arr: number[], from: number, to: number) => {
    let s = 0, c = 0;
    for (let i = from; i < to; i++) if (arr[i] > 0) { s += arr[i]; c++; }
    return c > 0 ? s / c : 0;
  };
  const p1 = meanRange(power, 0, mid);
  const p2 = meanRange(power, mid, n);
  const h1 = meanRange(hr,    0, mid);
  const h2 = meanRange(hr,    mid, n);
  if (p1 <= 0 || h1 <= 0) return 0;
  const powerRatio = Math.abs(p2 - p1) / p1;
  if (powerRatio > 0.05) return 0;
  return Math.max(0, Math.round(h2 - h1));
}

function formatMinSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, '0')}`;
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
