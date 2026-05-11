'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useBleStore } from '@/stores/bleStore';
import { useRouteStore } from '@/stores/routeStore';
import { useAthleteStore } from '@/stores/athleteStore';
import { createClient } from '@/lib/supabase/client';
import { Icons } from '@/components/icons';
import { POWER_ZONES } from '@/lib/zones';
import { computeSessionAggregates } from '@/lib/metrics';

const ACCENT = '#D5FF00';

export default function SummaryPage() {
  const router  = useRouter();
  const saved   = useRef(false);

  const distanceKm            = useBleStore(s => s.distanceKm);
  const elapsed               = useBleStore(s => s.elapsed);
  const ftp                   = useBleStore(s => s.ftp);
  const sessionPowerSeries    = useBleStore(s => s.sessionPowerSeries);
  const sessionHrSeries       = useBleStore(s => s.sessionHrSeries);
  const sessionCadenceSeries  = useBleStore(s => s.sessionCadenceSeries);
  const sessionSpeedSeries    = useBleStore(s => s.sessionSpeedSeries);
  const devices               = useBleStore(s => s.devices);
  const resetSession          = useBleStore(s => s.resetSession);
  const route   = useRouteStore(s => s.selectedRoute);
  const athlete = useAthleteStore(s => s.athlete);

  // ── Canonical aggregates (NP-based TSS, MMP curve, zones, decoupling, etc) ──
  const aggregates = useMemo(() => computeSessionAggregates({
    powerSeries:     sessionPowerSeries,
    hrSeries:        sessionHrSeries,
    cadenceSeries:   sessionCadenceSeries,
    durationSeconds: elapsed,
    ftp,
    maxHr:           athlete?.max_hr ?? 190,
  }), [sessionPowerSeries, sessionHrSeries, sessionCadenceSeries, elapsed, ftp, athlete?.max_hr]);

  const avgPower = aggregates.avgPower;
  const avgHR    = aggregates.avgHr;
  const kcal     = aggregates.calories;
  const tss      = aggregates.tss;
  const IF       = aggregates.intensityFactor;

  const dist     = distanceKm.toFixed(2);
  const avgSpeed = elapsed > 0 && distanceKm > 0 ? distanceKm / (elapsed / 3600) : 0;

  const hh = String(Math.floor(elapsed / 3600)).padStart(2,'0');
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2,'0');
  const ss = String(elapsed % 60).padStart(2,'0');
  const timeStr = elapsed >= 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;

  // Zone distribution — single source of truth in @/lib/zones
  const totalZoneSec = elapsed || 1;
  const zones = POWER_ZONES.map(z => ({
    id:    z.id,
    label: z.label,
    name:  z.name,
    color: z.color,
    sec:   aggregates.powerZoneSeconds[z.id],
    pct:   Math.round(aggregates.powerZoneSeconds[z.id] / totalZoneSec * 100),
  }));

  // Chart
  const CHART_LEN = 120;
  function downsample(arr: number[]) {
    if (arr.length === 0) return new Array(CHART_LEN).fill(0);
    const step = arr.length / CHART_LEN;
    return Array.from({ length: CHART_LEN }, (_, i) => arr[Math.min(arr.length-1, Math.floor(i * step))]);
  }
  const chartPower = downsample(sessionPowerSeries);
  const chartHR    = downsample(sessionHrSeries);
  const maxP = Math.max(...chartPower, 50);
  const maxH = Math.max(...chartHR, 80);
  const hasData = sessionPowerSeries.length > 1;

  const dPower = chartPower.map((v,i) => `${i===0?'M':'L'}${(i/(CHART_LEN-1))*100} ${100-(v/maxP)*100}`).join(' ');
  const dHR    = chartHR.map((v,i)    => `${i===0?'M':'L'}${(i/(CHART_LEN-1))*100} ${100-(v/maxH)*100}`).join(' ');

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }) + ' · ' +
    now.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

  // Auto-save session once
  useEffect(() => {
    if (saved.current || !athlete || elapsed < 5) return;
    saved.current = true;

    const supabase = createClient();
    supabase.from('sessions').insert({
      athlete_id:        athlete.id,
      route_id:          route?.id ?? null,
      started_at:        new Date(Date.now() - elapsed * 1000).toISOString(),
      duration_s:        elapsed,
      avg_power:         avgPower,
      avg_hr:            avgHR,
      calories:          kcal,
      distance_km:       parseFloat(dist),
      tss,
      // Time series
      power_series:      sessionPowerSeries.slice(-3600),
      hr_series:         sessionHrSeries.slice(-3600),
      cadence_series:    sessionCadenceSeries.slice(-3600),
      speed_series:      sessionSpeedSeries.slice(-3600),
      // Advanced metrics (Sprint 0 migration)
      normalized_power:  aggregates.normalizedPower,
      intensity_factor:  aggregates.intensityFactor,
      variability_index: aggregates.variabilityIndex,
      max_power:         aggregates.maxPower,
      max_hr:            aggregates.maxHr,
      avg_cadence:       aggregates.avgCadence,
      kj:                aggregates.kj,
      best_power:         aggregates.bestPower,
      power_zone_seconds: aggregates.powerZoneSeconds,
      hr_zone_seconds:    aggregates.hrZoneSeconds,
      ftp_at_time:        ftp,
      devices: {
        trainer: devices.trainer.name || null,
        cadence: devices.cadence.name || null,
        hr:      devices.hr.name      || null,
      },
    }).then(({ error }) => {
      if (error) console.error('Erro ao salvar sessão:', error.message);
    });
  }, [
    athlete, elapsed, avgPower, avgHR, kcal, dist, tss, ftp,
    sessionPowerSeries, sessionHrSeries, sessionCadenceSeries, sessionSpeedSeries,
    aggregates, devices, route,
  ]);

  function handleAgain() {
    resetSession();
    router.push('/route');
  }

  return (
    <div className="screen">
      <div className="summary">

        {/* Header */}
        <div className="sum-head">
          <div>
            <div className="crumb">
              <span style={{ letterSpacing:'0.18em' }}>Treino concluído</span> ·{' '}
              <span style={{ color:'var(--fg)' }}>{dateStr}</span>
            </div>
            <h1 className="h1" style={{ marginTop:10 }}>{route?.name ?? 'Sessão livre'}</h1>
            {route && (
              <div style={{ fontSize:14, color:'var(--fg-2)', marginTop:6, display:'flex', alignItems:'center', gap:6 }}>
                <Icons.Pin size={12}/> {route.location}
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <button className="btn" title="Em breve">Exportar .FIT</button>
            <button className="btn primary" onClick={handleAgain}>Voltar para início</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="sum-body">

        {/* Stats grid */}
        <div className="sum-stats">
          <div className="sum-stat">
            <div className="lbl">Distância</div>
            <div className="val">{dist}<small>km</small></div>
            {route && <div className="delta">{route.distance_km > 0 ? Math.round(parseFloat(dist)/route.distance_km*100) + '% da rota' : ''}</div>}
          </div>
          <div className="sum-stat">
            <div className="lbl">Tempo</div>
            <div className="val" style={{ fontSize: elapsed >= 3600 ? 22 : 30 }}>{timeStr}</div>
          </div>
          <div className="sum-stat">
            <div className="lbl">Vel. média</div>
            <div className="val">{avgSpeed > 0 ? avgSpeed.toFixed(1) : '—'}<small>{avgSpeed > 0 ? 'km/h' : ''}</small></div>
            {avgSpeed > 0 && distanceKm > 0 && <div className="delta">{dist} km percorridos</div>}
          </div>
          <div className="sum-stat">
            <div className="lbl">Potência média</div>
            <div className="val">{avgPower > 0 ? avgPower : '—'}<small>{avgPower > 0 ? 'W' : ''}</small></div>
            {avgPower > 0 && <div className="delta">{Math.round(IF*100)}% FTP</div>}
          </div>
          <div className="sum-stat">
            <div className="lbl">FC média</div>
            <div className="val">{avgHR > 0 ? avgHR : '—'}<small>{avgHR > 0 ? 'bpm' : ''}</small></div>
            {avgHR > 0 && athlete && <div className="delta">{Math.round(avgHR/athlete.max_hr*100)}% FCmáx</div>}
          </div>
          <div className="sum-stat">
            <div className="lbl">Calorias</div>
            <div className="val">{kcal > 0 ? kcal : '—'}<small>{kcal > 0 ? 'kcal' : ''}</small></div>
          </div>
          <div className="sum-stat">
            <div className="lbl">TSS</div>
            <div className="val">{tss > 0 ? tss : '—'}</div>
            {IF > 0 && <div className="delta">IF {IF.toFixed(2)}</div>}
          </div>
        </div>

        {/* Chart + Zones */}
        <div className="sum-grid">
          <div className="chart-card">
            <div className="chart-head">
              <h3>Potência & FC ao longo do tempo</h3>
            </div>
            {hasData ? (
              <div style={{ height:230, position:'relative', marginTop:6 }}>
                <div style={{ position:'absolute', left:0, top:0, bottom:18, width:40,
                  display:'flex', flexDirection:'column', justifyContent:'space-between',
                  fontFamily:"'JetBrains Mono'", fontSize:10, color:'var(--fg-3)', textAlign:'right', paddingRight:6 }}>
                  <span>{Math.round(maxP)}w</span>
                  <span>{Math.round(maxP*0.66)}w</span>
                  <span>{Math.round(maxP*0.33)}w</span>
                  <span>0w</span>
                </div>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none"
                  style={{ position:'absolute', left:42, right:0, top:0, bottom:18,
                    width:'calc(100% - 42px)', height:'calc(100% - 18px)' }}>
                  <defs>
                    <linearGradient id="pSumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity="0.45"/>
                      <stop offset="100%" stopColor={ACCENT} stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  {[25,50,75].map(y => (
                    <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="oklch(0.26 0.012 250)" strokeWidth="0.3" vectorEffect="non-scaling-stroke"/>
                  ))}
                  <path d={`${dPower} L100 100 L0 100 Z`} fill="url(#pSumGrad)"/>
                  <path d={dPower} stroke={ACCENT} strokeWidth="0.9" fill="none" vectorEffect="non-scaling-stroke"/>
                  {sessionHrSeries.length > 1 && (
                    <path d={dHR} stroke="var(--accent-2)" strokeWidth="0.9" fill="none" vectorEffect="non-scaling-stroke"/>
                  )}
                </svg>
                <div style={{ position:'absolute', left:42, right:0, bottom:0, height:18,
                  display:'flex', justifyContent:'space-between',
                  fontFamily:"'JetBrains Mono'", fontSize:10, color:'var(--fg-3)', alignItems:'center' }}>
                  <span>00:00</span>
                  <span>{mm}:{ss}</span>
                </div>
              </div>
            ) : (
              <div style={{ height:230, display:'flex', alignItems:'center', justifyContent:'center',
                color:'var(--fg-3)', fontSize:13, fontFamily:"'JetBrains Mono'" }}>
                Nenhum dado de sessão registrado.
              </div>
            )}
            <div style={{ display:'flex', gap:18, marginTop:8, fontSize:11.5, color:'var(--fg-2)', fontFamily:"'JetBrains Mono'" }}>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                <i style={{ width:12, height:2, background:ACCENT, display:'inline-block' }}/> Potência (W)
              </span>
              {sessionHrSeries.length > 1 && (
                <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <i style={{ width:12, height:2, background:'var(--accent-2)', display:'inline-block' }}/> FC (bpm)
                </span>
              )}
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-head">
              <h3>Distribuição de zonas — potência</h3>
            </div>
            {hasData ? (
              <>
                <div className="zones" style={{ marginTop:8 }}>
                  {zones.map(z => (
                    <div key={z.id} className="zone-row">
                      <div className="name"><b style={{ color:'var(--fg)' }}>{z.label}</b> {z.name}</div>
                      <div className="zone-bar">
                        <i style={{ width:`${Math.min(100, z.pct * 1.6)}%`, background:z.color }}/>
                      </div>
                      <div className="pct">{z.pct}%</div>
                    </div>
                  ))}
                </div>
                {zones[2].pct > 0 && (
                  <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--line-soft)',
                    display:'flex', justifyContent:'space-between',
                    fontFamily:"'JetBrains Mono'", fontSize:11.5, color:'var(--fg-2)' }}>
                    <span>Tempo em zona alvo (Z3)</span>
                    <span style={{ color:ACCENT }}>
                      <b>{Math.floor(zones[2].sec/60)}:{String(zones[2].sec%60).padStart(2,'0')}</b>
                      {' '}· {zones[2].pct}%
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ height:170, display:'flex', alignItems:'center', justifyContent:'center',
                color:'var(--fg-3)', fontSize:13, fontFamily:"'JetBrains Mono'" }}>
                Sem dados de potência na sessão.
              </div>
            )}
          </div>
        </div>

        {/* Sensors */}
        <div className="chart-card">
          <div className="chart-head"><h3>Sensores da sessão</h3></div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:8 }}>
            {(['trainer','cadence','hr'] as const).map(id => (
              <div key={id} style={{
                display:'grid', gridTemplateColumns:'80px 1fr auto', gap:10,
                padding:'10px 14px', background:'var(--bg)', border:'1px solid var(--line-soft)',
                borderRadius:8, fontSize:12, alignItems:'center', flex:'1 1 220px',
              }}>
                <div style={{ fontFamily:"'JetBrains Mono'", fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg-3)' }}>
                  {id === 'trainer' ? 'Smart Trainer' : id === 'cadence' ? 'Cadência' : 'Freq. Cardíaca'}
                </div>
                <div style={{ color:'var(--fg-2)' }}>{devices[id].name || 'Não conectado'}</div>
                <div style={{ fontFamily:"'JetBrains Mono'", fontSize:11, color: devices[id].name ? 'var(--ok)' : 'var(--fg-3)' }}>
                  {devices[id].name ? 'conectado' : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>

        </div>{/* end sum-body */}
      </div>
    </div>
  );
}
