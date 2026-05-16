/**
 * Training load / form computation — CTL, ATL, TSB.
 *
 * Used by the home dashboard ("Sua Forma") and future training-plan features.
 *
 *  - CTL (Chronic Training Load)  → fitness, EWMA of TSS with 42-day time constant.
 *  - ATL (Acute Training Load)    → fatigue, EWMA of TSS with 7-day time constant.
 *  - TSB (Training Stress Balance) = CTL_yesterday − ATL_yesterday  → freshness.
 *
 * Daily TSS is summed across all sessions on a given calendar day. Days with no
 * training contribute 0, which is intentional — rest is a valid input to the model.
 */

import type { Session } from '@/types';

const CTL_TC = 42;
const ATL_TC = 7;
const CTL_ALPHA = 1 - Math.exp(-1 / CTL_TC);
const ATL_ALPHA = 1 - Math.exp(-1 / ATL_TC);

export type FormStatus =
  | 'detraining'   // Very low fitness (CTL < 5) — needs to build
  | 'fresh'        // TSB >= 15 — too rested, ready for intensity
  | 'optimal'      // TSB in [5, 15) — race-ready freshness
  | 'building'     // TSB in [-10, 5) — productive training band
  | 'tired'        // TSB in [-30, -10) — accumulated fatigue
  | 'overreached'; // TSB < -30 — needs recovery

export interface DailyLoad {
  /** YYYY-MM-DD */
  date: string;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface FormState {
  ctl: number;
  atl: number;
  tsb: number;
  ctl7DaysAgo: number;
  ctlDelta: number;          // ctl - ctl7DaysAgo
  /** Daily timeline (oldest → newest). */
  daily: DailyLoad[];
  status: FormStatus;
  statusText: string;
}

function toDayKey(iso: string): string {
  return iso.slice(0, 10);
}

function todayLocalKey(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute current form + daily timeline for the past `days` days (default 90).
 * Sessions can be in any order — they will be bucketed by calendar day.
 */
export function computeForm(sessions: Session[], days: number = 90): FormState {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const k = toDayKey(s.started_at);
    byDay.set(k, (byDay.get(k) ?? 0) + (s.tss ?? 0));
  }

  const today = todayLocalKey();
  const start = new Date(today);
  start.setDate(start.getDate() - days);

  const daily: DailyLoad[] = [];
  let ctl = 0;
  let atl = 0;

  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const tss = byDay.get(key) ?? 0;

    // TSB is yesterday's freshness, before today's training is applied.
    const tsb = ctl - atl;

    ctl = ctl + (tss - ctl) * CTL_ALPHA;
    atl = atl + (tss - atl) * ATL_ALPHA;

    daily.push({
      date: key,
      tss,
      ctl: round1(ctl),
      atl: round1(atl),
      tsb: round1(tsb),
    });
  }

  const last = daily[daily.length - 1];
  const sevenAgo = daily[daily.length - 8] ?? daily[0];
  const ctlDelta = round1(last.ctl - sevenAgo.ctl);

  const { status, statusText } = classify(last.ctl, last.tsb);

  return {
    ctl: last.ctl,
    atl: last.atl,
    tsb: last.tsb,
    ctl7DaysAgo: sevenAgo.ctl,
    ctlDelta,
    daily,
    status,
    statusText,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function classify(ctl: number, tsb: number): { status: FormStatus; statusText: string } {
  if (ctl < 5) {
    return { status: 'detraining', statusText: 'Em construção — pedale para subir sua condição' };
  }
  if (tsb >= 15) {
    return { status: 'fresh', statusText: 'Muito descansado — momento ideal para um treino forte' };
  }
  if (tsb >= 5) {
    return { status: 'optimal', statusText: 'Descansado — pronto para sessões intensas' };
  }
  if (tsb >= -10) {
    return { status: 'building', statusText: 'Em construção — acumulando estímulo de forma produtiva' };
  }
  if (tsb >= -30) {
    return { status: 'tired', statusText: 'Cansado — priorize sessões mais leves' };
  }
  return { status: 'overreached', statusText: 'Sobrecargado — descanso é essencial agora' };
}
