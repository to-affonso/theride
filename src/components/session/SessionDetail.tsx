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
import { HeroStat } from '@/components/composites/HeroStat';
import { InsightList } from '@/components/composites/InsightList';
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
const CHART_LEN = 120;

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

  // ── Chart (inline SVG for Sprint 2A; uPlot replaces in Sprint 2B) ─────
  const chartPower = downsample(session.power_series, CHART_LEN);
  const chartHR    = downsample(session.hr_series,    CHART_LEN);
  const maxP = Math.max(...chartPower, 50);
  const maxH = Math.max(...chartHR, 80);
  const hasChartData = session.power_series.length > 1;
  const dPower = chartPower.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (CHART_LEN - 1)) * 100} ${100 - (v / maxP) * 100}`).join(' ');
  const dHR    = chartHR.map((v, i)    => `${i === 0 ? 'M' : 'L'}${(i / (CHART_LEN - 1)) * 100} ${100 - (v / maxH) * 100}`).join(' ');

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
            label="TSS"
            secondary={
              <>
                {session.normalized_power && <>NP <b>{session.normalized_power}W</b> · </>}
                IF <b>{iF > 0 ? iF.toFixed(2) : '—'}</b>
                {vi > 0 && <> · VI <b>{vi.toFixed(2)}</b></>}
              </>
            }
            classification={session.tss > 0 ? tssClass.label : undefined}
            recovery={session.tss > 0 ? `Recuperação estimada ${tssClass.recoveryHoursMin}–${tssClass.recoveryHoursMax}h` : undefined}
            highlight={highlight}
            highlightVariant={highlightVariant}
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

          {/* Chart + Zones (chart is interim Sprint 2A — Sprint 2B brings uPlot) */}
          <div className="sum-grid">
            <div className="chart-card">
              <div className="chart-head"><h3>Potência & FC ao longo do tempo</h3></div>
              {hasChartData ? (
                <div style={{ height: 230, position: 'relative', marginTop: 6 }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 18, width: 40,
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    fontFamily: "'JetBrains Mono'", fontSize: 10, color: 'var(--fg-3)', textAlign: 'right', paddingRight: 6,
                  }}>
                    <span>{Math.round(maxP)}w</span>
                    <span>{Math.round(maxP * 0.66)}w</span>
                    <span>{Math.round(maxP * 0.33)}w</span>
                    <span>0w</span>
                  </div>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none"
                    style={{ position: 'absolute', left: 42, right: 0, top: 0, bottom: 18, width: 'calc(100% - 42px)', height: 'calc(100% - 18px)' }}>
                    <defs>
                      <linearGradient id="sdPGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={ACCENT} stopOpacity="0.45"/>
                        <stop offset="100%" stopColor={ACCENT} stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    {[25, 50, 75].map(y => (
                      <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="oklch(0.26 0.012 250)" strokeWidth="0.3" vectorEffect="non-scaling-stroke"/>
                    ))}
                    <path d={`${dPower} L100 100 L0 100 Z`} fill="url(#sdPGrad)"/>
                    <path d={dPower} stroke={ACCENT} strokeWidth="0.9" fill="none" vectorEffect="non-scaling-stroke"/>
                    {session.hr_series.length > 1 && (
                      <path d={dHR} stroke="var(--accent-2)" strokeWidth="0.9" fill="none" vectorEffect="non-scaling-stroke"/>
                    )}
                  </svg>
                  <div style={{
                    position: 'absolute', left: 42, right: 0, bottom: 0, height: 18,
                    display: 'flex', justifyContent: 'space-between',
                    fontFamily: "'JetBrains Mono'", fontSize: 10, color: 'var(--fg-3)', alignItems: 'center',
                  }}>
                    <span>00:00</span>
                    <span>{formatClock(elapsed)}</span>
                  </div>
                </div>
              ) : (
                <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)', fontSize: 13, fontFamily: "'JetBrains Mono'" }}>
                  Nenhum dado de sessão registrado.
                </div>
              )}
              <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 11.5, color: 'var(--fg-2)', fontFamily: "'JetBrains Mono'" }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i style={{ width: 12, height: 2, background: ACCENT, display: 'inline-block' }}/> Potência (W)
                </span>
                {session.hr_series.length > 1 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i style={{ width: 12, height: 2, background: 'var(--accent-2)', display: 'inline-block' }}/> FC (bpm)
                  </span>
                )}
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-head"><h3>Distribuição de zonas — potência</h3></div>
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
                      <span>Tempo em zona alvo (Z3)</span>
                      <span style={{ color: ACCENT }}>
                        <b>{Math.floor(powerZones[2].sec / 60)}:{String(powerZones[2].sec % 60).padStart(2, '0')}</b>
                        {' '}· {powerZones[2].pct}%
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)', fontSize: 13, fontFamily: "'JetBrains Mono'" }}>
                  Sem dados de potência na sessão.
                </div>
              )}
            </div>
          </div>

          {/* HR zone distribution (new) */}
          {hasHrZones && (
            <div className="chart-card">
              <div className="chart-head"><h3>Distribuição de zonas — frequência cardíaca</h3></div>
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
          )}

          {/* Best efforts (MMP) */}
          {hasBestPower && (
            <div className="chart-card">
              <div className="chart-head">
                <h3>Melhores esforços</h3>
                {prs.length > 0 && (
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: ACCENT, letterSpacing: '0.08em' }}>
                    {prs.length} {prs.length === 1 ? 'PR' : 'PRs'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                {(['5s', '30s', '1min', '5min', '20min', '60min'] as const).map(k => {
                  const v = session.best_power?.[k];
                  if (!v) return null;
                  const isPr = prs.includes(k);
                  const delta = prDeltas[k];
                  return (
                    <div key={k} style={{
                      flex: '1 1 120px',
                      padding: '12px 14px',
                      background: isPr ? 'rgba(213,255,0,0.05)' : 'var(--bg)',
                      border: `1px solid ${isPr ? 'rgba(213,255,0,0.3)' : 'var(--line-soft)'}`,
                      borderRadius: 8,
                      position: 'relative',
                    }}>
                      {isPr && (
                        <span style={{ position: 'absolute', top: 6, right: 8, fontFamily: "'JetBrains Mono'", fontSize: 9, color: ACCENT, letterSpacing: '0.08em' }}>
                          ⭐ PR
                        </span>
                      )}
                      <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>{k}</div>
                      <div style={{ fontFamily: "'Inter'", fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 4, color: isPr ? ACCENT : 'var(--fg)' }}>
                        {v}<small style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-3)', marginLeft: 4, fontFamily: "'JetBrains Mono'" }}>W</small>
                      </div>
                      {isPr && delta !== undefined && delta > 0 && (
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, color: ACCENT, marginTop: 4 }}>
                          +{delta}W vs anterior
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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

// ── Helpers ─────────────────────────────────────────────────────────────────

function downsample(arr: number[], target: number): number[] {
  if (arr.length === 0) return new Array(target).fill(0);
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  return Array.from({ length: target }, (_, i) => arr[Math.min(arr.length - 1, Math.floor(i * step))]);
}
