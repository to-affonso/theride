'use client';

/**
 * History session detail.
 *
 * Read-only view of a saved session, loading from Supabase by id.
 * Visually mirrors the post-ride summary (same `.sum-*` classes) so the
 * user gets a consistent layout. Sprint 2 will replace this with the
 * expanded post-ride layout (cross-data scatters, MMP curve, insights).
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAthleteStore } from '@/stores/athleteStore';
import { Session } from '@/types';
import { Icons } from '@/components/icons';
import { POWER_ZONES } from '@/lib/zones';
import { formatClock, formatDateTime } from '@/lib/format';

const ACCENT = '#D5FF00';

export default function HistoryDetailPage() {
  const router  = useRouter();
  const params  = useParams<{ id: string }>();
  const athlete = useAthleteStore(s => s.athlete);
  const [session, setSession] = useState<Session | null | 'not-found'>(null);

  useEffect(() => {
    if (!params?.id) return;
    const supabase = createClient();
    supabase
      .from('sessions')
      .select('*, routes (id, name, location, distance_km, elevation_m)')
      .eq('id', params.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setSession('not-found'); return; }
        setSession(data as Session);
      });
  }, [params?.id]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalZoneSec = session && session !== 'not-found' ? session.duration_s || 1 : 1;

  const zones = useMemo(() => {
    if (!session || session === 'not-found') return [];
    const zs = session.power_zone_seconds ?? {};
    return POWER_ZONES.map(z => ({
      id:    z.id,
      label: z.label,
      name:  z.name,
      color: z.color,
      sec:   zs[z.id] ?? 0,
      pct:   Math.round((zs[z.id] ?? 0) / totalZoneSec * 100),
    }));
  }, [session, totalZoneSec]);

  if (session === null) {
    return (
      <div className="screen">
        <div className="summary">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--fg-3)', fontFamily: "'JetBrains Mono'", fontSize: 13 }}>
            Carregando treino…
          </div>
        </div>
      </div>
    );
  }

  if (session === 'not-found') {
    return (
      <div className="screen">
        <div className="summary">
          <div className="history-empty" style={{ marginTop: 80 }}>
            <h2>Treino não encontrado.</h2>
            <p>O treino que você procurou não existe ou foi removido.</p>
            <button className="btn primary" onClick={() => router.push('/history')}>
              Voltar ao histórico
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ftp     = session.ftp_at_time ?? 200;
  const np      = session.normalized_power ?? session.avg_power;
  const iF      = session.intensity_factor ?? (ftp > 0 ? np / ftp : 0);
  const vi      = session.variability_index ?? 0;
  const dist    = session.distance_km.toFixed(2);
  const elapsed = session.duration_s;
  const avgSpeed = elapsed > 0 && session.distance_km > 0
    ? session.distance_km / (elapsed / 3600)
    : 0;

  const dateLabel = formatDateTime(session.started_at);

  // Chart paths (reuse the same minimal SVG approach used in summary for v0)
  const CHART_LEN = 120;
  const chartPower = downsample(session.power_series, CHART_LEN);
  const chartHR    = downsample(session.hr_series,    CHART_LEN);
  const maxP = Math.max(...chartPower, 50);
  const maxH = Math.max(...chartHR, 80);
  const hasData = session.power_series.length > 1;
  const dPower = chartPower.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (CHART_LEN - 1)) * 100} ${100 - (v / maxP) * 100}`).join(' ');
  const dHR    = chartHR.map((v, i)    => `${i === 0 ? 'M' : 'L'}${(i / (CHART_LEN - 1)) * 100} ${100 - (v / maxH) * 100}`).join(' ');

  return (
    <div className="screen">
      <div className="summary">

        {/* Header */}
        <div className="sum-head">
          <div>
            <div className="crumb">
              <span style={{ letterSpacing: '0.18em' }}>Treino</span> ·{' '}
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
            <button className="btn" onClick={() => router.push('/history')}>
              ← Histórico
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="sum-body">

          {/* Stats grid */}
          <div className="sum-stats">
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
            </div>
            <div className="sum-stat">
              <div className="lbl">Vel. média</div>
              <div className="val">{avgSpeed > 0 ? avgSpeed.toFixed(1) : '—'}<small>{avgSpeed > 0 ? 'km/h' : ''}</small></div>
            </div>
            <div className="sum-stat">
              <div className="lbl">Potência média</div>
              <div className="val">{session.avg_power > 0 ? session.avg_power : '—'}<small>{session.avg_power > 0 ? 'W' : ''}</small></div>
              {session.normalized_power && <div className="delta">NP {session.normalized_power}W</div>}
            </div>
            <div className="sum-stat">
              <div className="lbl">FC média</div>
              <div className="val">{session.avg_hr > 0 ? session.avg_hr : '—'}<small>{session.avg_hr > 0 ? 'bpm' : ''}</small></div>
              {session.avg_hr > 0 && athlete && <div className="delta">{Math.round(session.avg_hr / athlete.max_hr * 100)}% FCmáx</div>}
            </div>
            <div className="sum-stat">
              <div className="lbl">Calorias</div>
              <div className="val">{session.calories > 0 ? session.calories : '—'}<small>{session.calories > 0 ? 'kcal' : ''}</small></div>
            </div>
            <div className="sum-stat">
              <div className="lbl">TSS</div>
              <div className="val">{session.tss > 0 ? session.tss : '—'}</div>
              {iF > 0 && <div className="delta">IF {iF.toFixed(2)}{vi > 0 ? ` · VI ${vi.toFixed(2)}` : ''}</div>}
            </div>
          </div>

          {/* Chart + Zones */}
          <div className="sum-grid">
            <div className="chart-card">
              <div className="chart-head">
                <h3>Potência & FC ao longo do tempo</h3>
              </div>
              {hasData ? (
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
                      <linearGradient id="histPGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={ACCENT} stopOpacity="0.45"/>
                        <stop offset="100%" stopColor={ACCENT} stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    {[25, 50, 75].map(y => (
                      <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="oklch(0.26 0.012 250)" strokeWidth="0.3" vectorEffect="non-scaling-stroke"/>
                    ))}
                    <path d={`${dPower} L100 100 L0 100 Z`} fill="url(#histPGrad)"/>
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
              {hasData ? (
                <>
                  <div className="zones" style={{ marginTop: 8 }}>
                    {zones.map(z => (
                      <div key={z.id} className="zone-row">
                        <div className="name"><b style={{ color: 'var(--fg)' }}>{z.label}</b> {z.name}</div>
                        <div className="zone-bar">
                          <i style={{ width: `${Math.min(100, z.pct * 1.6)}%`, background: z.color }}/>
                        </div>
                        <div className="pct">{z.pct}%</div>
                      </div>
                    ))}
                  </div>
                  {zones[2].pct > 0 && (
                    <div style={{
                      marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)',
                      display: 'flex', justifyContent: 'space-between',
                      fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: 'var(--fg-2)',
                    }}>
                      <span>Tempo em zona alvo (Z3)</span>
                      <span style={{ color: ACCENT }}>
                        <b>{Math.floor(zones[2].sec / 60)}:{String(zones[2].sec % 60).padStart(2, '0')}</b>
                        {' '}· {zones[2].pct}%
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

          {/* Best efforts (Mean Max Power) — quick read */}
          {session.best_power && Object.keys(session.best_power).length > 0 && (
            <div className="chart-card">
              <div className="chart-head"><h3>Melhores esforços</h3></div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                {(['5s', '30s', '1min', '5min', '20min', '60min'] as const).map(k => {
                  const v = session.best_power?.[k];
                  if (!v) return null;
                  return (
                    <div key={k} style={{
                      flex: '1 1 120px',
                      padding: '12px 14px',
                      background: 'var(--bg)',
                      border: '1px solid var(--line-soft)',
                      borderRadius: 8,
                    }}>
                      <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>{k}</div>
                      <div style={{ fontFamily: "'Inter'", fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 4 }}>
                        {v}<small style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-3)', marginLeft: 4, fontFamily: "'JetBrains Mono'" }}>W</small>
                      </div>
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

function downsample(arr: number[], target: number): number[] {
  if (arr.length === 0) return new Array(target).fill(0);
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  return Array.from({ length: target }, (_, i) => arr[Math.min(arr.length - 1, Math.floor(i * step))]);
}
