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
import { Tooltip } from '@/components/composites/Tooltip';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { PowerCurve } from '@/components/charts/PowerCurve';
import { ScatterCard } from '@/components/charts/ScatterCard';
import { POWER_ZONES, HR_ZONES } from '@/lib/zones';
import { classifyTss, type BestPower } from '@/lib/metrics';
import {
  detectPrs,
  prDeltasOf,
  compareToLast,
  buildHighlight,
} from '@/lib/comparison';
import { generateInsights } from '@/lib/insights';
import { formatClock, formatDateTime } from '@/lib/format';

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
  const comparison = useMemo(() => compareToLast(session, lastAttempt), [session, lastAttempt]);
  const highlight  = useMemo(() => buildHighlight(comparison, prs, prDeltas), [comparison, prs, prDeltas]);
  const highlightVariant: 'positive' | 'neutral' | 'down' = prs.length > 0 || (comparison.npDelta ?? 0) > 4
    ? 'positive'
    : (comparison.npDelta ?? 0) < -4 ? 'down' : 'neutral';
  const insights   = useMemo(() => generateInsights({ session, prs, prDeltas }), [session, prs, prDeltas]);
  const tssClass   = useMemo(() => classifyTss(session.tss), [session.tss]);

  // ── Zone displays ─────────────────────────────────────────────────────
  const totalZoneSec = elapsed || 1;
  const powerZones = useMemo(() => POWER_ZONES.map(z => ({
    ...z,
    sec: session.power_zone_seconds?.[z.id] ?? 0,
    pct: Math.round((session.power_zone_seconds?.[z.id] ?? 0) / totalZoneSec * 100),
  })), [session.power_zone_seconds, totalZoneSec]);

  const hrZones = useMemo(() => HR_ZONES.map(z => ({
    ...z,
    sec: session.hr_zone_seconds?.[z.id] ?? 0,
    pct: Math.round((session.hr_zone_seconds?.[z.id] ?? 0) / totalZoneSec * 100),
  })), [session.hr_zone_seconds, totalZoneSec]);

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
              </>
            }
            highlight={highlight}
            highlightVariant={highlightVariant}
            spectrumValue={session.tss}
            spectrumBands={TSS_BANDS}
            spectrumLabel="Posição na escala de TSS"
          />

          {/* Stats grid (TSS dropped here — already in hero) */}
          <div className="sum-stats" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
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
            </div>
            <div className="sum-stat">
              <div className="lbl">Potência média</div>
              <div className="val">{session.avg_power > 0 ? session.avg_power : '—'}<small>{session.avg_power > 0 ? 'W' : ''}</small></div>
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
              <div className="lbl">Calorias</div>
              <div className="val">{session.calories > 0 ? session.calories : '—'}<small>{session.calories > 0 ? 'kcal' : ''}</small></div>
              {session.kj && session.kj > 0 && <div className="delta">{session.kj} kJ trabalho</div>}
            </div>
          </div>

          {/* Insights */}
          <InsightList insights={insights} />

          {/* Time series — uPlot (full-width) */}
          <div className="chart-card">
            <div className="chart-head"><h3>Potência & FC ao longo do tempo</h3></div>
            {hasChartData ? (
              <div style={{ marginTop: 8 }}>
                <TimeSeriesChart
                  powerSeries={session.power_series}
                  hrSeries={session.hr_series}
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

          {/* Scatter — HR × Power (decoupling, two-half coloring) */}
          {hasScatter && (
            <div className="chart-card">
              <div className="chart-head">
                <h3>Acoplamento aeróbico</h3>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: 'var(--fg-3)' }}>FC × Potência</span>
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
                          <i style={{ width: `${Math.min(100, z.pct * 1.6)}%`, background: z.color }}/>
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
                        <i style={{ width: `${Math.min(100, z.pct * 1.6)}%`, background: z.color }}/>
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
                {prs.length > 0 && (
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: ACCENT, letterSpacing: '0.08em' }}>
                    {prs.length} {prs.length === 1 ? 'PR' : 'PRs'}
                  </span>
                )}
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

              {/* PR value pills below the curve */}
              {prs.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
                  {prs.map(k => {
                    const v     = session.best_power?.[k];
                    const delta = prDeltas[k];
                    if (!v) return null;
                    return (
                      <div key={k} style={{
                        flex: '1 1 100px', padding: '10px 12px',
                        background: 'rgba(213,255,0,0.05)',
                        border: '1px solid rgba(213,255,0,0.3)',
                        borderRadius: 8, position: 'relative',
                      }}>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>{k}</div>
                        <div style={{ fontFamily: "'Inter'", fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 2, color: ACCENT }}>
                          {v}<small style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-3)', marginLeft: 3, fontFamily: "'JetBrains Mono'" }}>W</small>
                        </div>
                        {delta != null && delta > 0 && (
                          <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: ACCENT, marginTop: 2 }}>+{delta}W</div>
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
                  display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 10,
                  padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--line-soft)',
                  borderRadius: 8, fontSize: 12, alignItems: 'center', flex: '1 1 220px',
                }}>
                  <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
                    {id === 'trainer' ? 'Smart Trainer' : id === 'cadence' ? 'Cadência' : 'Freq. Cardíaca'}
                  </div>
                  <div style={{ color: 'var(--fg-2)' }}>{session.devices[id] || 'Não conectado'}</div>
                  <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: session.devices[id] ? 'var(--ok)' : 'var(--fg-3)' }}>
                    {session.devices[id] ? 'conectado' : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

