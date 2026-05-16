'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAthleteStore } from '@/stores/athleteStore';
import type { Route, Session } from '@/types';

import { Icons } from '@/components/icons';
import { WorkoutListItem } from '@/components/history/WorkoutListItem';
import { SparkLine } from '@/components/charts/SparkLine';
import { useContainerWidth } from '@/components/charts/useContainerWidth';
import { GpxThumbnail } from '@/components/route/GpxThumbnail';

import {
  formatClock,
  periodStart,
} from '@/lib/format';
import { computeForm, type FormState, type DailyLoad } from '@/lib/form';
import { recommendWorkout, type Recommendation } from '@/lib/recommendation';
import { generateInsights, type Insight } from '@/lib/insights';
import {
  aggregateHistoricalBest,
  classifyPrs,
  detectPrs,
  prDeltasOf,
} from '@/lib/comparison';
import {
  MMP_WINDOWS_SECONDS,
  type BestPower,
  type MmpKey,
} from '@/lib/metrics';
import { loadLocalRoutes } from '@/lib/localRoutes';

const MMP_KEYS_ORDER: MmpKey[] = ['5s', '30s', '1min', '5min', '20min', '60min'];

function mmpKey(sec: number): MmpKey {
  switch (sec) {
    case 5:    return '5s';
    case 30:   return '30s';
    case 60:   return '1min';
    case 300:  return '5min';
    case 1200: return '20min';
    default:   return '60min';
  }
}

const RECOMMENDATION_ICON: Record<Recommendation['kind'], keyof typeof Icons> = {
  rest:      'Heart',
  recovery:  'Heart',
  base:      'Trainer',
  tempo:     'Cadence',
  intervals: 'Power',
  free:      'Play',
};

export default function HomePage() {
  const router  = useRouter();
  const athlete = useAthleteStore(s => s.athlete);

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [routes,   setRoutes]   = useState<Route[]   | null>(null);

  // ── Load sessions + routes ────────────────────────────────────────────
  useEffect(() => {
    if (!athlete) return;
    const supabase = createClient();

    supabase
      .from('sessions')
      .select('*, routes (id, name, location, distance_km, elevation_m, gpx_data)')
      .eq('athlete_id', athlete.id)
      .order('started_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) {
          console.error('Erro ao carregar treinos:', error.message);
          setSessions([]);
          return;
        }
        setSessions((data as Session[]) ?? []);
      });

    supabase
      .from('routes')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const remote = (data as Route[]) ?? [];
        const local  = loadLocalRoutes();
        // De-duplicate by id (local routes override remote with same id)
        const byId = new Map<string, Route>();
        for (const r of remote) byId.set(r.id, r);
        for (const r of local)  byId.set(r.id, r);
        setRoutes(Array.from(byId.values()));
      });
  }, [athlete]);

  // ── Derived state ─────────────────────────────────────────────────────
  const form = useMemo<FormState | null>(() => {
    if (!sessions) return null;
    return computeForm(sessions);
  }, [sessions]);

  const recommendation = useMemo<Recommendation | null>(() => {
    if (!sessions || !form) return null;
    return recommendWorkout(form, sessions);
  }, [sessions, form]);

  const lastSession = sessions?.[0] ?? null;

  const lastInsight = useMemo<Insight | null>(() => {
    if (!sessions || !lastSession) return null;
    const historicalBest = aggregateHistoricalBest(sessions, lastSession.id);
    const prs      = detectPrs(lastSession.best_power, historicalBest);
    const prKinds  = classifyPrs(historicalBest, prs);
    const prDeltas = prDeltasOf(lastSession.best_power, historicalBest, prs);
    const insights = generateInsights({ session: lastSession, prs, prDeltas, prKinds });
    return insights[0] ?? null;
  }, [sessions, lastSession]);

  // PR map across all sessions for the recent-activity cards
  const prMap = useMemo(() => {
    if (!sessions) return new Map<string, MmpKey[]>();
    const chrono = [...sessions].sort((a, b) =>
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );
    const holder: Record<MmpKey, { value: number; sessionId: string } | null> = {
      '5s': null, '30s': null, '1min': null, '5min': null, '20min': null, '60min': null,
    };
    for (const s of chrono) {
      const bp = (s.best_power ?? {}) as BestPower;
      for (const w of MMP_WINDOWS_SECONDS) {
        const k = mmpKey(w);
        const v = bp[k];
        if (v !== undefined && v > 0 && (holder[k] === null || v > holder[k]!.value)) {
          holder[k] = { value: v, sessionId: s.id };
        }
      }
    }
    const map = new Map<string, MmpKey[]>();
    for (const k of MMP_KEYS_ORDER) {
      const h = holder[k];
      if (!h) continue;
      const arr = map.get(h.sessionId) ?? [];
      arr.push(k);
      map.set(h.sessionId, arr);
    }
    return map;
  }, [sessions]);

  // Week summary (last 7 days)
  const weekSummary = useMemo(() => {
    if (!sessions) return null;
    const start7 = periodStart('7d')!;
    const start14 = new Date(start7);
    start14.setDate(start14.getDate() - 7);

    let count = 0, tss = 0, km = 0, sec = 0;
    let prevTss = 0;
    for (const s of sessions) {
      const t = new Date(s.started_at);
      if (t >= start7) {
        count += 1;
        tss += s.tss;
        km  += s.distance_km;
        sec += s.duration_s;
      } else if (t >= start14) {
        prevTss += s.tss;
      }
    }
    // Percent deltas become misleading when the previous week was near-zero.
    // Below a meaningful baseline (30 TSS ≈ a single light ride) we surface the
    // raw delta instead so "1700%" doesn't show up after a week off.
    let deltaLabel: string;
    let deltaAccent: 'positive' | 'negative' | 'neutral';
    if (prevTss < 30) {
      const raw = tss - prevTss;
      deltaLabel  = raw === 0 ? '—' : `${raw > 0 ? '↑ +' : '↓ '}${Math.abs(raw)} TSS`;
      deltaAccent = raw === 0 ? 'neutral' : raw > 0 ? 'positive' : 'negative';
    } else {
      const pct = Math.round(((tss - prevTss) / prevTss) * 100);
      const capped = Math.max(-200, Math.min(200, pct));
      const prefix = pct >= 200 ? '↑ >' : pct <= -200 ? '↓ >' : pct > 0 ? '↑ ' : pct < 0 ? '↓ ' : '↔ ';
      deltaLabel  = pct === 0 ? '↔ 0%' : `${prefix}${Math.abs(capped)}%`;
      deltaAccent = pct === 0 ? 'neutral' : pct > 0 ? 'positive' : 'negative';
    }
    return { count, tss, km, sec, deltaLabel, deltaAccent };
  }, [sessions]);

  // ── "Para Você" — recommended routes (Phase 2) ────────────────────────
  const recommendedRoutes = useMemo<Route[]>(() => {
    if (!routes || !sessions) return [];
    const doneIds = new Set(sessions.map(s => s.route_id).filter(Boolean) as string[]);
    const notDone = routes.filter(r => !doneIds.has(r.id));
    const done    = routes.filter(r => doneIds.has(r.id));
    // Interleave: 2 new + 2 done, capped at 4
    const picks: Route[] = [];
    for (let i = 0; i < 4; i++) {
      if (notDone[i]) picks.push(notDone[i]);
      if (picks.length >= 4) break;
      if (done[i])    picks.push(done[i]);
      if (picks.length >= 4) break;
    }
    return picks.slice(0, 4);
  }, [routes, sessions]);

  // ── State flags ───────────────────────────────────────────────────────
  const isLoading   = athlete === null || sessions === null;
  const isFirstTime = athlete !== null && sessions !== null && sessions.length === 0;

  const firstName  = athlete?.name?.split(' ')[0] ?? 'atleta';
  const today      = new Date();

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="screen">
      <div className="home">

        <HomeGreeting
          firstName={firstName}
          today={today}
          form={form}
          isLoading={isLoading}
          isFirstTime={isFirstTime}
          daysSinceLast={lastSession ? daysAgo(lastSession.started_at) : null}
        />

        {isFirstTime ? (
          <FirstTimeChecklist
            hasFtp={!!athlete?.ftp}
            onChooseRoute={() => router.push('/route')}
            onOpenSettings={() => router.push('/settings')}
          />
        ) : (
          <>
            <HeroCta
              recommendation={recommendation}
              isLoading={isLoading}
              onStart={() => router.push('/route')}
            />

            <FormSection form={form} isLoading={isLoading} />

            <InsightSection
              insight={lastInsight}
              lastSession={lastSession}
              isLoading={isLoading}
              onOpenSession={() => lastSession && router.push(`/history/${lastSession.id}`)}
            />

            <WeekSection
              summary={weekSummary}
              isLoading={isLoading}
              onOpenHistory={() => router.push('/history')}
            />

            <RecentSection
              sessions={sessions?.slice(0, 3) ?? []}
              prMap={prMap}
              isLoading={isLoading}
              onOpenSession={(id) => router.push(`/history/${id}`)}
              onOpenHistory={() => router.push('/history')}
            />

            <ForYouSection
              routes={recommendedRoutes}
              isLoading={isLoading}
              onOpenRoutes={() => router.push('/route')}
              onPick={() => router.push('/route')}
            />
          </>
        )}

      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Greeting                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

function HomeGreeting({
  firstName,
  today,
  form,
  isLoading,
  isFirstTime,
  daysSinceLast,
}: {
  firstName: string;
  today: Date;
  form: FormState | null;
  isLoading: boolean;
  isFirstTime: boolean;
  daysSinceLast: number | null;
}) {
  const subtitle = (() => {
    if (isLoading) return 'Carregando seu painel…';
    if (isFirstTime) return 'Vamos preparar seu primeiro treino.';
    if (daysSinceLast !== null && daysSinceLast > 7) {
      return `Bom ter você de volta — ${daysSinceLast} dias desde o último treino.`;
    }
    return form?.statusText ?? 'Tudo pronto para hoje.';
  })();

  return (
    <div className="home-greeting">
      <div>
        <h1 className="h1">Olá, {firstName}.</h1>
        <p className="lede" style={{ marginTop: 8 }}>{subtitle}</p>
      </div>
      <div className="home-greeting-date mono">
        {formatHeaderDate(today)}
      </div>
    </div>
  );
}

function formatHeaderDate(d: Date): string {
  const day     = String(d.getDate()).padStart(2, '0');
  const month   = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
  const weekday = d.toLocaleString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${day} ${month} · ${weekday}`;
}

function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Hero CTA                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

function HeroCta({
  recommendation,
  isLoading,
  onStart,
}: {
  recommendation: Recommendation | null;
  isLoading: boolean;
  onStart: () => void;
}) {
  if (isLoading || !recommendation) {
    return <div className="hero-cta hero-cta-skeleton" aria-hidden />;
  }

  const IconCmp = Icons[RECOMMENDATION_ICON[recommendation.kind]];

  return (
    <div className="hero-cta">
      <div className="hero-cta-main">
        <div className="hero-cta-eyebrow">Recomendado hoje</div>

        <div className="hero-cta-headline">
          <div className="hero-cta-icon" aria-hidden>
            <IconCmp size={22} />
          </div>
          <div>
            <h2 className="hero-cta-title">{recommendation.title}</h2>
            <div className="hero-cta-desc">{recommendation.description}</div>
          </div>
        </div>

        <div className="hero-cta-meta mono">
          {recommendation.durationHint && (
            <span><span className="hcm-lbl">Duração</span> {recommendation.durationHint}</span>
          )}
          {recommendation.zoneHint && (
            <span><span className="hcm-lbl">Zona</span> {recommendation.zoneHint}</span>
          )}
        </div>

        <p className="hero-cta-reason">
          <span className="hcr-lbl">Por quê:</span> {recommendation.reasoning}
        </p>
      </div>

      <div className="hero-cta-actions">
        <button className="btn primary lg" onClick={onStart}>
          Pedalar agora <Icons.Arrow size={14} />
        </button>
        <div className="hero-cta-actions-hint mono">
          Você escolhe a rota na próxima tela
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Sua Forma                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

function FormSection({ form, isLoading }: { form: FormState | null; isLoading: boolean }) {
  return (
    <section className="home-section">
      <header className="home-section-head">
        <div className="home-section-label">Sua forma</div>
        <div className="home-section-aux mono">
          últimos 90 dias · modelo Coggan
        </div>
      </header>

      {(isLoading || !form) ? (
        <div className="form-card form-card-skeleton" aria-hidden />
      ) : (
        <div className="form-card">
          <FormSpectrum tsb={form.tsb} />

          <div className="form-grid">
            <FormCell
              label="Forma"
              value={signed(form.tsb)}
              hint={statusHint(form)}
              accent="primary"
            />
            <FormCell
              label="Condição"
              value={String(Math.round(form.ctl))}
              hint={form.ctlDelta === 0
                ? '— vs 7 dias atrás'
                : `${form.ctlDelta > 0 ? '↑' : '↓'} ${Math.abs(form.ctlDelta).toFixed(1)} vs 7 dias`}
              accent={form.ctlDelta >= 0 ? 'positive' : 'neutral'}
            />
            <FormCell
              label="Fadiga"
              value={String(Math.round(form.atl))}
              hint={fatigueHint(form.atl)}
              accent="neutral"
            />
          </div>

          <FormSpark daily={form.daily} />
        </div>
      )}
    </section>
  );
}

function signed(n: number): string {
  const rounded = Math.round(n);
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

function statusHint(form: FormState): string {
  switch (form.status) {
    case 'fresh':       return 'Muito descansado';
    case 'optimal':     return 'Descansado';
    case 'building':    return 'Em construção';
    case 'tired':       return 'Cansado';
    case 'overreached': return 'Sobrecargado';
    case 'detraining':  return 'Construindo base';
  }
}

function fatigueHint(atl: number): string {
  if (atl < 20) return 'Baixa';
  if (atl < 50) return 'Moderada';
  if (atl < 80) return 'Alta';
  return 'Muito alta';
}

function FormCell({
  label, value, hint, accent = 'neutral',
}: {
  label: string;
  value: string;
  hint: string;
  accent?: 'primary' | 'positive' | 'neutral';
}) {
  return (
    <div className="form-cell">
      <div className="form-cell-label">{label}</div>
      <div className={`form-cell-value ${accent}`}>{value}</div>
      <div className="form-cell-hint">{hint}</div>
    </div>
  );
}

function FormSpectrum({ tsb }: { tsb: number }) {
  // Map TSB ∈ [-40, +30] to a marker position 0–100%.
  const min = -40, max = 30;
  const range = max - min;
  const clamped = Math.max(min, Math.min(max, tsb));
  const pos = ((clamped - min) / range) * 100;

  // Ticks align with band boundaries so the scale visually matches the bands.
  const ticks = [
    { value: '-40', pct: 0 },
    { value: '-10', pct: ((-10 - min) / range) * 100 }, // ≈ 42.86
    { value:  '+5', pct: (( 5  - min) / range) * 100 }, // ≈ 64.29
    { value: '+15', pct: ((15  - min) / range) * 100 }, // ≈ 78.57
    { value: '+30', pct: 100 },
  ];

  return (
    <div className="form-spectrum">
      <div className="fs-bar">
        <div className="fs-band fs-band-tired">Cansado</div>
        <div className="fs-band fs-band-build">Construindo</div>
        <div className="fs-band fs-band-optimal">Pronto</div>
        <div className="fs-band fs-band-fresh">Descansado</div>
        <div className="fs-marker" style={{ left: `${pos}%` }} />
      </div>
      <div className="fs-scale mono">
        {ticks.map((t, i) => (
          <span
            key={t.value}
            className={`fs-tick${i === 0 ? ' is-first' : ''}${i === ticks.length - 1 ? ' is-last' : ''}`}
            style={{ left: `${t.pct}%` }}
          >
            {t.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function FormSpark({ daily }: { daily: DailyLoad[] }) {
  // SparkLine renders absolute SVG coordinates (no viewBox), so we have to
  // measure the actual container width and feed it in — otherwise the path
  // stops at the default width regardless of CSS scaling.
  const { ref, width } = useContainerWidth<HTMLDivElement>(800);
  const last30 = daily.slice(-30);
  const ctlSeries = last30.map(d => d.ctl);
  const atlSeries = last30.map(d => d.atl);

  return (
    <div className="form-spark">
      <div className="form-spark-head">
        <span className="mono fss-label">Condição (últimos 30 dias)</span>
        <span className="mono fss-legend">
          <i className="fss-dot fss-dot-ctl"/> Condição
          <i className="fss-dot fss-dot-atl"/> Fadiga
        </span>
      </div>
      <div ref={ref} className="form-spark-stack">
        <SparkLine data={atlSeries} width={width} height={48} color="var(--accent-2)" resolution={30} />
        <div className="form-spark-overlay">
          <SparkLine data={ctlSeries} width={width} height={48} color="var(--accent)" resolution={30} />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Insight                                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

function InsightSection({
  insight,
  lastSession,
  isLoading,
  onOpenSession,
}: {
  insight: Insight | null;
  lastSession: Session | null;
  isLoading: boolean;
  onOpenSession: () => void;
}) {
  return (
    <section className="home-section">
      <header className="home-section-head">
        <div className="home-section-label">Insight do último treino</div>
        {lastSession && !isLoading && (
          <button className="home-section-link" onClick={onOpenSession}>
            Ver análise <Icons.Arrow size={12} />
          </button>
        )}
      </header>

      {(isLoading || !insight) ? (
        <div className="insight-card insight-card-empty">
          {isLoading ? 'Carregando…' : 'Pedale para gerar seu primeiro insight automático.'}
        </div>
      ) : (
        <button className={`insight-card ${insight.variant}`} onClick={onOpenSession} type="button">
          <span className="insight-card-icon">
            <InsightIcon kind={insight.icon ?? defaultIcon(insight.variant)} />
          </span>
          <span className="insight-card-text">{insight.text}</span>
          <span className="insight-card-arrow">
            <Icons.Arrow size={14} />
          </span>
        </button>
      )}
    </section>
  );
}

function defaultIcon(v: Insight['variant']): NonNullable<Insight['icon']> {
  if (v === 'positive') return 'check';
  if (v === 'caution')  return 'alert';
  return 'info';
}

function InsightIcon({ kind }: { kind: NonNullable<Insight['icon']> }) {
  switch (kind) {
    case 'trophy': return <Icons.Trophy size={18}/>;
    case 'check':  return <Icons.CheckCircle size={18}/>;
    case 'info':   return <Icons.Info size={18}/>;
    case 'alert':  return <Icons.Alert size={18}/>;
  }
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Sua Semana                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

function WeekSection({
  summary,
  isLoading,
  onOpenHistory,
}: {
  summary: {
    count: number;
    tss: number;
    km: number;
    sec: number;
    deltaLabel: string;
    deltaAccent: 'positive' | 'negative' | 'neutral';
  } | null;
  isLoading: boolean;
  onOpenHistory: () => void;
}) {
  return (
    <section className="home-section">
      <header className="home-section-head">
        <div className="home-section-label">Sua semana</div>
        <button className="home-section-link" onClick={onOpenHistory}>
          Ver histórico <Icons.Arrow size={12} />
        </button>
      </header>

      {isLoading || !summary ? (
        <div className="week-summary week-summary-skeleton" aria-hidden />
      ) : (
        <button className="week-summary" onClick={onOpenHistory} type="button">
          <WeekCell label="Treinos" value={String(summary.count)} />
          <WeekCell label="Distância" value={Math.round(summary.km)} suffix="km" />
          <WeekCell label="TSS total" value={String(summary.tss)} />
          <WeekCell label="Tempo" value={formatClock(summary.sec)} />
          <WeekCell
            label="vs 7 dias antes"
            value={summary.deltaLabel}
            accent={summary.deltaAccent}
          />
        </button>
      )}
    </section>
  );
}

function WeekCell({
  label,
  value,
  suffix,
  accent = 'neutral',
}: {
  label: string;
  value: string | number;
  suffix?: string;
  accent?: 'neutral' | 'positive' | 'negative';
}) {
  return (
    <div className="week-cell">
      <span className="week-cell-label">{label}</span>
      <span className={`week-cell-value ${accent}`}>
        {value}{suffix && <small>{suffix}</small>}
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Atividades Recentes                                                      */
/* ──────────────────────────────────────────────────────────────────────── */

function RecentSection({
  sessions,
  prMap,
  isLoading,
  onOpenSession,
  onOpenHistory,
}: {
  sessions: Session[];
  prMap: Map<string, MmpKey[]>;
  isLoading: boolean;
  onOpenSession: (id: string) => void;
  onOpenHistory: () => void;
}) {
  return (
    <section className="home-section">
      <header className="home-section-head">
        <div className="home-section-label">Atividades recentes</div>
        {!isLoading && sessions.length > 0 && (
          <button className="home-section-link" onClick={onOpenHistory}>
            Ver todas <Icons.Arrow size={12} />
          </button>
        )}
      </header>

      {isLoading ? (
        <div className="workout-list">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="workout-skeleton"/>)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="insight-card insight-card-empty">
          Sem treinos registrados ainda.
        </div>
      ) : (
        <div className="workout-list">
          {sessions.map(s => (
            <WorkoutListItem
              key={s.id}
              session={s}
              prs={prMap.get(s.id) ?? []}
              onClick={() => onOpenSession(s.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Para Você (Phase 2)                                                      */
/* ──────────────────────────────────────────────────────────────────────── */

function ForYouSection({
  routes,
  isLoading,
  onOpenRoutes,
  onPick,
}: {
  routes: Route[];
  isLoading: boolean;
  onOpenRoutes: () => void;
  onPick: (id: string) => void;
}) {
  if (!isLoading && routes.length === 0) return null;

  return (
    <section className="home-section">
      <header className="home-section-head">
        <div className="home-section-label">Para você</div>
        <button className="home-section-link" onClick={onOpenRoutes}>
          Ver todas as rotas <Icons.Arrow size={12} />
        </button>
      </header>

      {isLoading ? (
        <div className="route-mini-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="route-mini route-mini-skeleton" aria-hidden />
          ))}
        </div>
      ) : (
        <div className="route-mini-grid">
          {routes.map(r => (
            <RouteMiniCard key={r.id} route={r} onClick={() => onPick(r.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function RouteMiniCard({ route, onClick }: { route: Route; onClick: () => void }) {
  const points = route.gpx_data?.points;
  return (
    <button className="route-mini" onClick={onClick} type="button">
      <div className="route-mini-thumb">
        {points && points.length > 1 ? (
          <GpxThumbnail points={points} />
        ) : (
          <div className="route-mini-thumb-fallback" aria-hidden>
            <Icons.Pin size={20} c="var(--fg-3)" />
          </div>
        )}
      </div>
      <div className="route-mini-body">
        <div className="route-mini-name">{route.name}</div>
        <div className="route-mini-stats mono">
          <span><b>{route.distance_km.toFixed(0)}</b> km</span>
          <span className="sep">·</span>
          <span><b>{route.elevation_m}</b> m</span>
          <span className="sep">·</span>
          <span className={`difficulty d${route.difficulty}`} aria-label={`Dificuldade ${route.difficulty}/5`}>
            {'●'.repeat(route.difficulty)}{'○'.repeat(5 - route.difficulty)}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* First-time onboarding (Estado A — Phase 2)                              */
/* ──────────────────────────────────────────────────────────────────────── */

function FirstTimeChecklist({
  hasFtp,
  onChooseRoute,
  onOpenSettings,
}: {
  hasFtp: boolean;
  onChooseRoute: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <section className="home-section">
      <header className="home-section-head">
        <div className="home-section-label">Vamos começar</div>
      </header>

      <div className="onboarding-card">
        <div className="onboarding-intro">
          Três passos rápidos antes do seu primeiro treino. Cada um vai melhorar a precisão das suas métricas.
        </div>

        <ol className="onboarding-list">
          <li className="onboarding-step done">
            <span className="os-num"><Icons.Check size={14} /></span>
            <div className="os-body">
              <div className="os-title">Conta criada</div>
              <div className="os-sub">Tudo pronto para registrar seus dados.</div>
            </div>
          </li>

          <li className={`onboarding-step ${hasFtp ? 'done' : ''}`}>
            <span className="os-num">
              {hasFtp ? <Icons.Check size={14} /> : '2'}
            </span>
            <div className="os-body">
              <div className="os-title">Defina seu FTP e perfil</div>
              <div className="os-sub">
                Sua FTP calibra todas as zonas de potência. Sem ela, as métricas perdem precisão.
              </div>
              {!hasFtp && (
                <button className="btn ghost" onClick={onOpenSettings} style={{ marginTop: 8 }}>
                  Abrir configurações
                </button>
              )}
            </div>
          </li>

          <li className="onboarding-step">
            <span className="os-num">3</span>
            <div className="os-body">
              <div className="os-title">Escolha sua primeira rota e pedale</div>
              <div className="os-sub">
                Sua sessão vira referência para PRs, forma e recomendações.
              </div>
              <button className="btn primary" onClick={onChooseRoute} style={{ marginTop: 8 }}>
                Escolher rota <Icons.Arrow size={14} />
              </button>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
