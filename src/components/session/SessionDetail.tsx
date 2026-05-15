'use client';

/**
 * SessionDetail — the canonical post-ride / history-detail layout.
 *
 * Used by both `/summary` (post-ride) and `/history/[id]` (historical),
 * with the only difference being the header text and footer actions
 * (controlled via `mode` + `headerActions`).
 *
 * This component owns the visual structure. Caller is responsible for:
 *   - Providing the Session object (from BLE store or Supabase)
 *   - Providing comparison context (lastAttempt, historicalBest)
 *   - Wiring action buttons via `headerActions` prop
 */

import { ReactNode, useMemo } from 'react';
import { Session, Athlete } from '@/types';
import { Icons } from '@/components/icons';
import { HeroStat, HeroSpectrumBand } from '@/components/composites/HeroStat';
import { InsightList } from '@/components/composites/InsightList';
import { SplitsTable } from '@/components/composites/SplitsTable';
import { Tooltip } from '@/components/composites/Tooltip';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { PowerCurve } from '@/components/charts/PowerCurve';
import { ScatterCard } from '@/components/charts/ScatterCard';
import { RouteMap } from '@/components/charts/RouteMap';
import { ElevationProfile } from '@/components/charts/ElevationProfile';
import { POWER_ZONES, HR_ZONES } from '@/lib/zones';
import { classifyTss, type BestPower } from '@/lib/metrics';
import { decoupling } from '@/lib/metrics/decoupling';
import {
  detectPrs,
  prDeltasOf,
  classifyPrs,
  compareToLast,
  buildHighlight,
} from '@/lib/comparison';
import { generateInsights } from '@/lib/insights';
import { formatClock, formatDateTime } from '@/lib/format';
import { positionAt, totalElevationGain } from '@/lib/gpx';
import { computeKmSplits } from '@/lib/splits';

const ACCENT = '#D5FF00';

/** Bands for the TSS spectrum bar — matches `classifyTss()` thresholds. */
const TSS_BANDS: HeroSpectrumBand[] = [
  { label: 'Recup.',   min: 0,   max: 50       },
  { label: 'Moderado', min: 50,  max: 100      },
  { label: 'Mod-alto', min: 100, max: 150      },
  { label: 'Intenso',  min: 150, max: 250      },
  { label: 'Épico',    min: 250, max: 400      },
  { label: 'Extremo',  min: 400, max: Infinity },
];

interface SessionDetailProps {
  session: Session;
  athlete: Athlete | null;
  /** Most recent prior attempt on the same route, if any. */
  lastAttempt?: Session | null;
  /** All-time best per MMP window (excluding current session). */
  historicalBest?: BestPower;
  /** Controls header copy: "Treino concluído" vs "Treino". */
  mode: 'post-ride' | 'history';
  /** Buttons rendered on the right side of the header. */
  headerActions?: ReactNode;
}

export function SessionDetail({
  session,
  athlete,
  lastAttempt = null,
  historicalBest = {},
  mode,
  headerActions,
}: SessionDetailProps) {
  // ── Derived metrics ───────────────────────────────────────────────────
  const ftp     = session.ftp_at_time ?? 200;
  const np      = session.normalized_power ?? session.avg_power;
  const iF      = session.intensity_factor ?? (ftp > 0 ? np / ftp : 0);
  const vi      = session.variability_index ?? 0;
  const elapsed = session.duration_s;
  const dist    = session.distance_km.toFixed(2);
  const avgSpeed = elapsed > 0 && session.distance_km > 0
    ? session.distance_km / (elapsed / 3600)
    : 0;
  const dateLabel = formatDateTime(session.started_at);

  // ── Comparison + PRs + insights ───────────────────────────────────────
  const prs        = useMemo(() => detectPrs(session.best_power, historicalBest), [session.best_power, historicalBest]);
  const prDeltas   = useMemo(() => prDeltasOf(session.best_power, historicalBest, prs), [session.best_power, historicalBest, prs]);
  const prKinds    = useMemo(() => classifyPrs(historicalBest, prs), [historicalBest, prs]);
  const improvedPrs = prs.filter(k => prKinds[k] === 'improved');
  const hasImprovedPr = improvedPrs.length > 0;
  // Pick the longest improved window for the prominent banner — longer = more meaningful.
  const MMP_ORDER: readonly string[] = ['60min', '20min', '5min', '1min', '30s', '5s'];
  const topImprovedPr = hasImprovedPr
    ? [...improvedPrs].sort((a, b) => MMP_ORDER.indexOf(a) - MMP_ORDER.indexOf(b))[0]
    : null;
  const comparison = useMemo(() => compareToLast(session, lastAttempt), [session, lastAttempt]);
  const highlight  = useMemo(() => buildHighlight(comparison, prs, prDeltas, prKinds), [comparison, prs, prDeltas, prKinds]);
  const highlightVariant: 'positive' | 'neutral' | 'down' = prs.length > 0 || (comparison.npDelta ?? 0) > 4
    ? 'positive'
    : (comparison.npDelta ?? 0) < -4 ? 'down' : 'neutral';
  const insights   = useMemo(() => generateInsights({ session, prs, prDeltas, prKinds }), [session, prs, prDeltas, prKinds]);
  const tssClass   = useMemo(() => classifyTss(session.tss), [session.tss]);

  // ── Performance peaks (derive from series; fall back to persisted) ────
  const maxPower   = session.max_power ?? maxOfSeries(session.power_series);
  const maxHr      = session.max_hr    ?? maxOfSeries(session.hr_series);
  const maxSpeed   = maxOfSeries(session.speed_series ?? []);
  const avgCadence = session.avg_cadence ?? avgNonZero(session.cadence_series ?? []);
  const maxCadence = maxOfSeries(session.cadence_series ?? []);
  const wPerKg     = athlete && athlete.weight > 0 && session.avg_power > 0
    ? session.avg_power / athlete.weight
    : 0;

  // ── Aerobic decoupling % ──────────────────────────────────────────────
  const decouplingPct = useMemo(
    () => decoupling(session.power_series, session.hr_series),
    [session.power_series, session.hr_series],
  );

  // ── Per-km splits ─────────────────────────────────────────────────────
  const splits = useMemo(() => computeKmSplits({
    powerSeries:     session.power_series,
    hrSeries:        session.hr_series,
    cadenceSeries:   session.cadence_series,
    speedSeries:     session.speed_series,
    totalDistanceKm: session.distance_km,
    durationS:       session.duration_s,
  }), [session.power_series, session.hr_series, session.cadence_series, session.speed_series, session.distance_km, session.duration_s]);

  // ── Elevation series (derived from route GPX, aligned to ride samples) ─
  const elevationSeries = useMemo<number[]>(() => {
    const points = session.routes?.gpx_data?.points;
    if (!points || points.length < 2) return [];
    const n = Math.max(session.power_series.length, session.hr_series.length);
    if (n < 2) return [];
    const totalKm = points[points.length - 1].distKm;
    if (totalKm <= 0) return [];

    const speeds = session.speed_series;
    const dists  = new Array<number>(n);
    if (speeds && speeds.length === n) {
      // Integrate speed (km/h) over 1s samples.
      let cum = 0;
      for (let i = 0; i < n; i++) {
        cum += Math.max(0, speeds[i]) / 3600;
        dists[i] = Math.min(cum, totalKm);
      }
    } else {
      for (let i = 0; i < n; i++) dists[i] = (i / (n - 1)) * totalKm;
    }
    return dists.map(d => positionAt(points, d).ele);
  }, [session.routes, session.power_series.length, session.hr_series.length, session.speed_series]);

  // ── Zone displays ─────────────────────────────────────────────────────
  // Percentages are normalized against the sum of zone samples (not elapsed
  // duration) because the source series may not be exactly 1Hz — guarantees
  // the bars sum to 100%.
  const powerZones = useMemo(() => {
    const total = POWER_ZONES.reduce((s, z) => s + (session.power_zone_seconds?.[z.id] ?? 0), 0) || 1;
    const scale = elapsed > 0 ? elapsed / total : 0;
    return POWER_ZONES.map(z => {
      const raw = session.power_zone_seconds?.[z.id] ?? 0;
      return { ...z, sec: Math.round(raw * scale), pct: Math.round(raw / total * 100) };
    });
  }, [session.power_zone_seconds, elapsed]);

  const hrZones = useMemo(() => {
    const total = HR_ZONES.reduce((s, z) => s + (session.hr_zone_seconds?.[z.id] ?? 0), 0) || 1;
    const scale = elapsed > 0 ? elapsed / total : 0;
    return HR_ZONES.map(z => {
      const raw = session.hr_zone_seconds?.[z.id] ?? 0;
      return { ...z, sec: Math.round(raw * scale), pct: Math.round(raw / total * 100) };
    });
  }, [session.hr_zone_seconds, elapsed]);

  const hasPowerZones = powerZones.some(z => z.sec > 0);
  const hasHrZones    = hrZones.some(z => z.sec > 0);

  // ── Chart data flags ─────────────────────────────────────────────────
  const hasChartData  = session.power_series.length > 1 || session.hr_series.length > 1;
  const hasScatter    = session.power_series.length > 60 && session.hr_series.length > 60;

  // ── Best efforts (only if we have data from Sprint 0+ ride) ───────────
  const hasBestPower = session.best_power && Object.keys(session.best_power).length > 0;

  const crumbHead = mode === 'post-ride' ? 'Treino concluído' : 'Treino';

  return (
    <div className="screen">
      <div className="summary">

        {/* Header */}
        <div className="sum-head">
          <div>
            <div className="crumb">
              <span style={{ letterSpacing: '0.18em' }}>{crumbHead}</span> ·{' '}
              <span style={{ color: 'var(--fg)' }}>{dateLabel}</span>
            </div>
            <h1 className="h1" style={{ marginTop: 10 }}>{session.routes?.name ?? 'Sessão livre'}</h1>
            {session.routes?.location && (
              <div style={{ fontSize: 14, color: 'var(--fg-2)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icons.Pin size={12}/> {session.routes.location}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {headerActions}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="sum-body">

          {/* Hero stat — TSS protagonist */}
          <HeroStat
            value={session.tss > 0 ? session.tss : '—'}
            label={
              <Tooltip
                width={260}
                content={
                  <>
                    <strong>TSS — Training Stress Score</strong>
                    <br/>Carga total do treino combinando intensidade e duração.
                    Referência: <em>100 TSS = 1h ao seu FTP</em>.
                  </>
                }
              >
                TSS
              </Tooltip>
            }
            classification={session.tss > 0 ? tssClass.label : undefined}
            recovery={session.tss > 0 ? `Recuperação estimada ${tssClass.recoveryHoursMin}–${tssClass.recoveryHoursMax}h` : undefined}
            secondary={
              <>
                {session.normalized_power && (
                  <span>
                    <Tooltip
                      width={280}
                      content={
                        <>
                          <strong>NP — Normalized Power</strong>
                          <br/>Estimativa da potência metabolicamente equivalente em esforço variável.
                          <br/>Pondera picos mais que potência média — reflete melhor o custo fisiológico.
                        </>
                      }
                    >
                      NP
                    </Tooltip>
                    {' '}<b>{session.normalized_power}W</b>
                  </span>
                )}
                <span>
                  <Tooltip
                    width={260}
                    content={
                      <>
                        <strong>IF — Intensity Factor</strong>
                        <br/>Razão entre NP e seu FTP. <em>1.0 = esforço de 1h no limite</em>.
                        <br/>Acima de 0.95 indica race effort.
                      </>
                    }
                  >
                    IF
                  </Tooltip>
                  {' '}<b>{iF > 0 ? iF.toFixed(2) : '—'}</b>
                </span>
                {vi > 0 && (
                  <span>
                    <Tooltip
                      width={280}
                      content={
                        <>
                          <strong>VI — Variability Index</strong>
                          <br/>NP dividido pela potência média.
                          <br/><em>1.00–1.05</em> = treino estável (base).
                          {' '}<em>&gt; 1.10</em> = surgy (intervalos / race).
                        </>
                      }
                    >
                      VI
                    </Tooltip>
                    {' '}<b>{vi.toFixed(2)}</b>
                  </span>
                )}
                {wPerKg > 0 && (
                  <span>
                    <Tooltip
                      width={260}
                      content={
                        <>
                          <strong>W/kg — Potência relativa</strong>
                          <br/>Potência média dividida pelo seu peso.
                          <br/>Métrica universal para comparar ciclistas independentemente do tamanho.
                        </>
                      }
                    >
                      W/kg
                    </Tooltip>
                    {' '}<b>{wPerKg.toFixed(2)}</b>
                  </span>
                )}
              </>
            }
            highlight={!hasImprovedPr ? highlight : null}
            highlightVariant={highlightVariant}
            prominentBadge={topImprovedPr && (
              <>
                <span className="hero-stat-banner-icon"><Icons.Trophy size={20}/></span>
                <div className="hero-stat-banner-text">
                  <div className="hero-stat-banner-title">Novo PR de {labelOfMmp(topImprovedPr)}</div>
                  <div className="hero-stat-banner-body">
                    {session.best_power?.[topImprovedPr] ?? '—'} W
                    {improvedPrs.length > 1 && (
                      <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--fg-3)', fontWeight: 500 }}>
                        +{improvedPrs.length - 1} {improvedPrs.length - 1 === 1 ? 'outro PR' : 'outros PRs'} nesta sessão
                      </span>
                    )}
                  </div>
                </div>
                {(prDeltas[topImprovedPr] ?? 0) > 0 && (
                  <span className="hero-stat-banner-delta">+{prDeltas[topImprovedPr]}W vs anterior</span>
                )}
              </>
            )}
            spectrumValue={session.tss}
            spectrumBands={TSS_BANDS}
            spectrumLabel="Posição na escala de TSS"
          />

          {/* Stats grid — 4x2: row 1 = ride context, row 2 = body/energy.
              Velocidade and Potência fold their peak into a "máx" sub-line so
              FC média + FC máx can sit side-by-side. */}
          <div className="sum-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="sum-stat">
              <div className="lbl">Distância</div>
              <div className="val">{dist}<small>km</small></div>
              {session.routes && session.routes.distance_km > 0 && (
                <div className="delta">{Math.round(parseFloat(dist) / session.routes.distance_km * 100)}% da rota</div>
              )}
            </div>
            <div className="sum-stat">
              <div className="lbl">Tempo</div>
              <div className="val" style={{ fontSize: elapsed >= 3600 ? 22 : 30 }}>{formatClock(elapsed)}</div>
              {comparison.hasComparison && comparison.durationDelta !== undefined && (
                <div className={`delta ${comparison.durationDelta < 0 ? '' : 'neg'}`}>
                  {comparison.durationDelta < 0 ? '↓' : '↑'} {formatClock(Math.abs(comparison.durationDelta))} vs anterior
                </div>
              )}
            </div>
            <div className="sum-stat">
              <div className="lbl">Vel. média</div>
              <div className="val">{avgSpeed > 0 ? avgSpeed.toFixed(1) : '—'}<small>{avgSpeed > 0 ? 'km/h' : ''}</small></div>
              {maxSpeed > 0 && <div className="delta">máx {maxSpeed} km/h</div>}
            </div>
            <div className="sum-stat">
              <div className="lbl">Potência média</div>
              <div className="val">{session.avg_power > 0 ? session.avg_power : '—'}<small>{session.avg_power > 0 ? 'W' : ''}</small></div>
              {maxPower > 0 && (
                <div className="delta">
                  máx {maxPower} W
                  {athlete && athlete.weight > 0 && ` · ${(maxPower / athlete.weight).toFixed(1)} W/kg pico`}
                </div>
              )}
              {comparison.hasComparison && comparison.avgPowerDelta !== undefined && comparison.avgPowerDelta !== 0 && (
                <div className={`delta ${comparison.avgPowerDelta > 0 ? '' : 'neg'}`}>
                  {comparison.avgPowerDelta > 0 ? '↑' : '↓'} {Math.abs(Math.round(comparison.avgPowerDelta))}W vs anterior
                </div>
              )}
            </div>

            <div className="sum-stat">
              <div className="lbl">FC média</div>
              <div className="val">{session.avg_hr > 0 ? session.avg_hr : '—'}<small>{session.avg_hr > 0 ? 'bpm' : ''}</small></div>
              {session.avg_hr > 0 && athlete && (
                <div className="delta">{Math.round(session.avg_hr / athlete.max_hr * 100)}% FCmáx</div>
              )}
            </div>
            <div className="sum-stat">
              <div className="lbl">FC máx</div>
              <div className="val">{maxHr > 0 ? maxHr : '—'}<small>{maxHr > 0 ? 'bpm' : ''}</small></div>
              {maxHr > 0 && athlete && (
                <div className="delta">{Math.round(maxHr / athlete.max_hr * 100)}% FCmáx</div>
              )}
            </div>
            <div className="sum-stat">
              <div className="lbl">Cadência média</div>
              <div className="val">{avgCadence > 0 ? avgCadence : '—'}<small>{avgCadence > 0 ? 'rpm' : ''}</small></div>
              {maxCadence > 0 && <div className="delta">máx {maxCadence} rpm</div>}
            </div>
            <div className="sum-stat">
              <div className="lbl">Calorias</div>
              <div className="val">{session.calories > 0 ? session.calories : '—'}<small>{session.calories > 0 ? 'kcal' : ''}</small></div>
              {session.kj && session.kj > 0 && <div className="delta">{session.kj} kJ trabalho</div>}
            </div>
          </div>

          {/* Insights */}
          <InsightList insights={insights} />

          {/* Map + elevation profile — only when the route has GPX data */}
          {session.routes?.gpx_data?.points && session.routes.gpx_data.points.length > 1 && (() => {
            const points = session.routes.gpx_data.points;
            const ascent = totalElevationGain(points);
            return (
              <div className="chart-card">
                <div className="chart-head">
                  <h3>Mapa e elevação</h3>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: "'JetBrains Mono'", fontSize: 11, color: 'var(--fg-3)' }}>
                    <span>{points[points.length - 1].distKm.toFixed(1)} km de rota</span>
                    <span>·</span>
                    <span>{ascent}m de ascensão</span>
                  </span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <RouteMap points={points} distanceCoveredKm={session.distance_km} height={260}/>
                </div>
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line-soft)' }}>
                  <ElevationProfile points={points} distanceCoveredKm={session.distance_km} height={140}/>
                </div>
              </div>
            );
          })()}

          {/* Time series — uPlot (full-width) */}
          <div className="chart-card">
            <div className="chart-head"><h3>Potência & FC ao longo do tempo</h3></div>
            {hasChartData ? (
              <div style={{ marginTop: 8 }}>
                <TimeSeriesChart
                  powerSeries={session.power_series}
                  hrSeries={session.hr_series}
                  cadenceSeries={session.cadence_series}
                  elevationSeries={elevationSeries}
                  durationSeconds={elapsed}
                  height={240}
                />
              </div>
            ) : (
              <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)', fontSize: 13, fontFamily: "'JetBrains Mono'" }}>
                Nenhum dado de sessão registrado.
              </div>
            )}
          </div>

          {/* Splits per km */}
          {splits.length >= 2 && (
            <div className="chart-card">
              <div className="chart-head">
                <h3>Splits por km</h3>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: 'var(--fg-3)' }}>
                  {splits.length} {splits.length === 1 ? 'split' : 'splits'}
                </span>
              </div>
              <SplitsTable splits={splits}/>
            </div>
          )}

          {/* Scatter — HR × Power (decoupling, two-half coloring) */}
          {hasScatter && (
            <div className="chart-card">
              <div className="chart-head">
                <h3>Acoplamento aeróbico</h3>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: "'JetBrains Mono'", fontSize: 11, color: 'var(--fg-3)' }}>
                  <Tooltip
                    width={300}
                    content={
                      <>
                        <strong>Decoupling Pa:Hr</strong>
                        <br/>Mede se a FC subiu enquanto a potência se manteve estável.
                        <br/><em>&lt; 5%</em> = boa base aeróbica.
                        <br/><em>5–8%</em> = aceitável para tempo/limiar.
                        <br/><em>&gt; 8%</em> = fadiga, desidratação ou base fraca.
                      </>
                    }
                  >
                    <span>Decoupling</span>
                  </Tooltip>
                  <b style={{ color: decouplingPct > 8 ? 'var(--accent-2)' : decouplingPct > 5 ? 'var(--fg-2)' : 'var(--ok)' }}>
                    {decouplingPct > 0 ? `${decouplingPct.toFixed(1)}%` : '—'}
                  </b>
                  <span style={{ color: 'var(--fg-3)' }}>· FC × Potência</span>
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                <ScatterCard
                  powerSeries={session.power_series}
                  hrSeries={session.hr_series}
                  height={200}
                />
              </div>
              <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 11, color: 'var(--fg-3)', fontFamily: "'JetBrains Mono'" }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i style={{ width: 8, height: 8, borderRadius: '50%', background: '#D5FF00', display: 'inline-block' }}/>
                  1ª metade
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF5A1F', display: 'inline-block' }}/>
                  2ª metade
                </span>
                <span style={{ marginLeft: 'auto', color: 'var(--fg-3)', fontSize: 10.5 }}>
                  deriva vertical = fadiga
                </span>
              </div>
            </div>
          )}

          {/* Zone distributions — power + HR side by side */}
          <div className="sum-grid">
            <div className="chart-card">
              <div className="chart-head"><h3>Zonas de potência</h3></div>
              {hasPowerZones ? (
                <>
                  <div className="zones" style={{ marginTop: 8 }}>
                    {powerZones.map(z => (
                      <div key={z.id} className="zone-row">
                        <div className="name"><b style={{ color: 'var(--fg)' }}>{z.label}</b> {z.name}</div>
                        <div className="zone-bar">
                          <i style={{ width: `${z.pct}%`, background: z.color }}/>
                        </div>
                        <div className="pct">{z.pct}%</div>
                      </div>
                    ))}
                  </div>
                  {powerZones[2].pct > 0 && (
                    <div style={{
                      marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)',
                      display: 'flex', justifyContent: 'space-between',
                      fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: 'var(--fg-2)',
                    }}>
                      <span>Tempo em Z3</span>
                      <span style={{ color: ACCENT }}>
                        <b>{Math.floor(powerZones[2].sec / 60)}:{String(powerZones[2].sec % 60).padStart(2, '0')}</b>
                        {' '}· {powerZones[2].pct}%
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)', fontSize: 13, fontFamily: "'JetBrains Mono'" }}>
                  Sem dados de potência.
                </div>
              )}
            </div>

            {hasHrZones ? (
              <div className="chart-card">
                <div className="chart-head"><h3>Zonas de FC</h3></div>
                <div className="zones" style={{ marginTop: 8 }}>
                  {hrZones.map(z => (
                    <div key={z.id} className="zone-row">
                      <div className="name"><b style={{ color: 'var(--fg)' }}>{z.label}</b> {z.name}</div>
                      <div className="zone-bar">
                        <i style={{ width: `${z.pct}%`, background: z.color }}/>
                      </div>
                      <div className="pct">{z.pct}%</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="chart-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--fg-3)', fontSize: 13, fontFamily: "'JetBrains Mono'" }}>
                  Sem dados de FC.
                </span>
              </div>
            )}
          </div>

          {/* Power curve — MMP with PR markers */}
          {hasBestPower && (
            <div className="chart-card">
              <div className="chart-head">
                <h3>Curva de potência</h3>
                {prs.length > 0 && (() => {
                  const improvedCount = prs.filter(k => prKinds[k] === 'improved').length;
                  const firstCount    = prs.length - improvedCount;
                  return (
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: improvedCount > 0 ? ACCENT : 'var(--fg-3)', letterSpacing: '0.08em' }}>
                      {improvedCount > 0
                        ? `${improvedCount} ${improvedCount === 1 ? 'PR' : 'PRs'}${firstCount > 0 ? ` · ${firstCount} primeiro${firstCount > 1 ? 's' : ''}` : ''}`
                        : `${firstCount} primeiro${firstCount > 1 ? 's registros' : ' registro'}`}
                    </span>
                  );
                })()}
              </div>
              <div style={{ marginTop: 8 }}>
                <PowerCurve
                  current={session.best_power ?? {}}
                  historical={historicalBest}
                  prs={prs}
                  height={200}
                />
              </div>
              <div style={{ display: 'flex', gap: 18, marginTop: 6, fontSize: 11, color: 'var(--fg-3)', fontFamily: "'JetBrains Mono'" }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i style={{ width: 14, height: 2, background: ACCENT, display: 'inline-block', borderRadius: 1 }}/>
                  Este treino
                </span>
                {Object.keys(historicalBest).length > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i style={{ width: 14, height: 2, background: '#555555', display: 'inline-block', borderRadius: 1, borderTop: '2px dashed #555555' }}/>
                    Melhor histórico
                  </span>
                )}
                {prs.length > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, display: 'inline-block' }}/>
                    PR
                  </span>
                )}
              </div>

              {/* PR value pills below the curve. First-time registrations are
                  shown with a muted style — they're not real PRs yet, just the
                  baseline being built. */}
              {prs.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
                  {prs.map(k => {
                    const v     = session.best_power?.[k];
                    const delta = prDeltas[k];
                    const kind  = prKinds[k] ?? 'first';
                    if (!v) return null;
                    const isImproved = kind === 'improved';
                    return (
                      <div key={k} style={{
                        flex: '1 1 100px', padding: '10px 12px',
                        background: isImproved ? 'rgba(213,255,0,0.05)' : 'var(--bg)',
                        border: `1px solid ${isImproved ? 'rgba(213,255,0,0.3)' : 'var(--line-soft)'}`,
                        borderRadius: 8, position: 'relative',
                      }}>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>{k}</div>
                        <div style={{ fontFamily: "'Inter'", fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 2, color: isImproved ? ACCENT : 'var(--fg)' }}>
                          {v}<small style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-3)', marginLeft: 3, fontFamily: "'JetBrains Mono'" }}>W</small>
                        </div>
                        {isImproved && delta != null && delta > 0 ? (
                          <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: ACCENT, marginTop: 2 }}>+{delta}W</div>
                        ) : (
                          <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: 'var(--fg-3)', marginTop: 2 }}>primeiro registro</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sensors */}
          <div className="chart-card">
            <div className="chart-head"><h3>Sensores da sessão</h3></div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              {(['trainer', 'cadence', 'hr'] as const).map(id => (
                <div key={id} style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10,
                  padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--line-soft)',
                  borderRadius: 8, fontSize: 12, alignItems: 'center', flex: '1 1 220px',
                }}>
                  <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
                    {id === 'trainer' ? 'Smart Trainer' : id === 'cadence' ? 'Cadência' : 'Freq. Cardíaca'}
                  </div>
                  <div style={{ color: 'var(--fg-2)' }}>{session.devices[id] || '—'}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function maxOfSeries(arr: number[]): number {
  let m = 0;
  for (const v of arr) if (v > m) m = v;
  return Math.round(m);
}

function avgNonZero(arr: number[]): number {
  let s = 0, n = 0;
  for (const v of arr) if (v > 0) { s += v; n++; }
  return n > 0 ? Math.round(s / n) : 0;
}

function labelOfMmp(k: string): string {
  switch (k) {
    case '5s':    return '5s';
    case '30s':   return '30s';
    case '1min':  return '1 min';
    case '5min':  return '5 min';
    case '20min': return '20 min';
    case '60min': return '1 h';
    default:      return k;
  }
}

