/**
 * Workout recommendation — rule-based suggestion for "what should I ride today?".
 *
 * Inputs:
 *  - Current form (CTL/ATL/TSB)
 *  - Recent session history (last few days)
 *
 * Output: a single Recommendation with a title, description, and human-readable
 * reasoning that the home dashboard surfaces above the primary CTA.
 *
 * Deliberately deterministic and conservative — no LLM, no surprises. As we add
 * structured workouts in a later phase, this becomes the entry point for plan
 * selection.
 */

import type { Session } from '@/types';
import type { FormState } from './form';

export type RecommendationKind =
  | 'rest'
  | 'recovery'
  | 'base'
  | 'tempo'
  | 'intervals'
  | 'free';

export interface Recommendation {
  kind: RecommendationKind;
  /** Short headline shown in the hero. */
  title: string;
  /** One-line description of the workout shape. */
  description: string;
  /** Why this was recommended — human language, tied to the user's data. */
  reasoning: string;
  /** Suggested duration window, e.g. "60-90 min". */
  durationHint?: string;
  /** Suggested zone window, e.g. "Z2". */
  zoneHint?: string;
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

/**
 * Recommend a workout for today given the athlete's current form and recent
 * training. Sessions are expected sorted DESC by `started_at` (most recent first).
 */
export function recommendWorkout(form: FormState, sessions: Session[]): Recommendation {
  const lastSession = sessions[0] ?? null;
  const daysOff = lastSession ? daysSince(lastSession.started_at) : 999;

  // ── Beginner / detraining ──────────────────────────────────────────────
  if (form.ctl < 5) {
    return {
      kind: 'free',
      title: 'Pedalada livre',
      description: 'Comece com uma rota fácil para registrar baseline.',
      reasoning: 'Você ainda está construindo sua base. Cada treino vira referência.',
      durationHint: '30-60 min',
      zoneHint: 'Z1-Z2',
    };
  }

  // ── Overreached → rest ─────────────────────────────────────────────────
  if (form.tsb < -30) {
    return {
      kind: 'rest',
      title: 'Descanso recomendado',
      description: 'Sua carga está alta. Hoje, recuperação ativa ou folga total.',
      reasoning: `Forma em ${form.tsb.toFixed(0)} — você acumulou estímulo. Recuperar agora preserva os ganhos.`,
      durationHint: '0-30 min',
      zoneHint: 'Z1',
    };
  }

  // ── Yesterday was intense → recovery ───────────────────────────────────
  if (lastSession && daysOff <= 1 && lastSession.tss >= 80) {
    return {
      kind: 'recovery',
      title: 'Recuperação ativa',
      description: 'Rodagem leve em Z1-Z2 para limpar a fadiga acumulada.',
      reasoning: `Seu último treino somou ${lastSession.tss} TSS. Hoje, prioridade é recuperar.`,
      durationHint: '30-45 min',
      zoneHint: 'Z1-Z2',
    };
  }

  // ── Coming back from 3+ days off → base ride ───────────────────────────
  if (daysOff >= 3) {
    return {
      kind: 'base',
      title: 'Retomada aeróbica',
      description: 'Volume em Z2 para reativar o sistema aeróbico.',
      reasoning: `Faz ${daysOff} dias desde seu último treino. Base aeróbica é o caminho mais seguro para retomar.`,
      durationHint: '60-90 min',
      zoneHint: 'Z2',
    };
  }

  // ── Fresh and ready → intervals ────────────────────────────────────────
  if (form.tsb >= 5) {
    return {
      kind: 'intervals',
      title: 'Treino intervalado',
      description: 'Sua forma permite estímulo intenso. Intervalos em Z4-Z5.',
      reasoning: `Forma em +${form.tsb.toFixed(0)} — momento ideal para subir o teto.`,
      durationHint: '60-90 min',
      zoneHint: 'Z4-Z5',
    };
  }

  // ── Productive building band → tempo ───────────────────────────────────
  if (form.tsb >= -10) {
    return {
      kind: 'tempo',
      title: 'Treino de tempo',
      description: 'Pacing estável em Z3 para construir limiar.',
      reasoning: 'Sua condição está em fase produtiva. Um treino moderado consolida ganhos.',
      durationHint: '45-75 min',
      zoneHint: 'Z3',
    };
  }

  // ── Tired band → easier base ───────────────────────────────────────────
  return {
    kind: 'base',
    title: 'Base aeróbica leve',
    description: 'Volume em Z2 sem subir a intensidade.',
    reasoning: `Forma em ${form.tsb.toFixed(0)} — hoje volume sem stress preserva os ganhos.`,
    durationHint: '45-75 min',
    zoneHint: 'Z2',
  };
}
