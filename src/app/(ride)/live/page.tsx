'use client';

/**
 * Live ride page.
 *
 * Layout (Sprint 4):
 *   ┌──────────────┐  ┌─────────────────┐  ┌──────────────┐
 *   │ Route name   │  │   T E M P O     │  │  Distância   │
 *   │              │  │   (centro)      │  │              │
 *   └──────────────┘  └─────────────────┘  └──────────────┘
 *                          [ map fills background ]
 *                          [ rider marker + gradient tag ]
 *                          [ elevation track ]
 *   ┌─Power─┐ ┌─Cadence─┐ ┌─HR─┐ ┌─Speed─┐    play strip
 *
 * Power and HR cards colour-code by zone (POWER_ZONES / HR_ZONES from
 * `lib/zones.ts`), matching the post-ride report.
 *
 * Power and HR primary value uses 3-second rolling average by default; a
 * toggle in the in-ride settings popover switches to instant (1s).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBleStore } from '@/stores/bleStore';
import { useRouteStore } from '@/stores/routeStore';
import { useAthleteStore } from '@/stores/athleteStore';
import { Icons } from '@/components/icons';
import { DeviceModal } from '@/components/DeviceModal';
import LiveMap from '@/components/LiveMap';
import { gradeAt, positionAt } from '@/lib/gpx';
import { getPowerZone, getHrZone } from '@/lib/zones';
import { LapChip } from '@/components/live/LapChip';
import { DisconnectModal } from '@/components/live/DisconnectModal';
import { LiveSettingsPopover } from '@/components/live/LiveSettingsPopover';

const ACCENT = '#D5FF00';

// ── Synthetic fallback map (used when route has no GPX) ───────────────────────
const ROUTE_PTS: [number, number][] = (() => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 240; i++) {
    const t = i / 240 * Math.PI * 2;
    const r = 0.78 + 0.13 * Math.sin(t * 3) + 0.07 * Math.sin(t * 7 + 1) + 0.05 * Math.sin(t * 11);
    pts.push([Math.cos(t) * r, Math.sin(t) * r * 0.78]);
  }
  return pts;
})();

function synthElevAt(t: number) {
  const v = Math.sin(t * Math.PI * 2.2 + 0.6) * 0.4 + Math.sin(t * Math.PI * 5 + 1.1) * 0.18 + 0.5 + t * 0.05;
  return Math.max(0, Math.min(1, v));
}

function SyntheticMapCanvas({ progress, currentGrade }: { progress: number; currentGrade: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1440, h: 836 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const idx = Math.floor(progress * ROUTE_PTS.length) % ROUTE_PTS.length;
  const rp  = ROUTE_PTS[idx] ?? ROUTE_PTS[0];
  const np  = ROUTE_PTS[(idx + 1) % ROUTE_PTS.length];
  const ang = Math.atan2(np[1] - rp[1], np[0] - rp[0]) * 180 / Math.PI;

  const SCALE = 280;
  const cx = size.w / 2 - rp[0] * SCALE;
  const cy = size.h / 2 - rp[1] * SCALE;

  const toScreen = (p: [number, number]): [number, number] => [cx + p[0] * SCALE, cy + p[1] * SCALE];
  const dPath = (arr: [number, number][]) => arr.map((p, i) => {
    const [x, y] = toScreen(p);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const past   = ROUTE_PTS.slice(0, idx + 1);
  const future = ROUTE_PTS.slice(idx);
  const [px, py] = toScreen(rp);

  const markers = Array.from({ length: 8 }, (_, m) => {
    const t = (m + 1) / 8;
    const i = Math.min(ROUTE_PTS.length - 1, Math.floor(t * ROUTE_PTS.length));
    return { p: ROUTE_PTS[i], km: Math.round(t * 24.6 * 10) / 10 };
  });

  const gradeColor = currentGrade > 0 ? '#FF9F43' : currentGrade < -1 ? '#4ade80' : 'var(--fg)';
  const gradeSign  = currentGrade >= 0 ? '+' : '';

  return (
    <div ref={ref} className="map-canvas">
      <svg width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <pattern id="map-grid-major" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform={`translate(${cx % 120} ${cy % 120})`}>
            <path d="M0 0 L0 120 M0 0 L120 0" stroke="oklch(0.22 0.012 250)" strokeWidth="1"/>
          </pattern>
          <pattern id="map-grid-minor" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform={`translate(${cx % 30} ${cy % 30})`}>
            <path d="M0 0 L0 30 M0 0 L30 0" stroke="oklch(0.20 0.012 250)" strokeWidth="0.5"/>
          </pattern>
          <radialGradient id="map-vignette" cx="50%" cy="55%" r="60%">
            <stop offset="0%" stopColor="rgba(0,0,0,0)"/>
            <stop offset="100%" stopColor="rgba(0,0,0,0.6)"/>
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#map-grid-minor)"/>
        <rect width="100%" height="100%" fill="url(#map-grid-major)"/>
        <path d={dPath(ROUTE_PTS)} stroke="oklch(0.28 0.015 250)" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={dPath(future)} stroke="oklch(0.45 0.015 250)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 6"/>
        <path d={dPath(past)} stroke={ACCENT} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)"/>
        {markers.map((m, i) => {
          if (!m.p) return null;
          const [x, y] = toScreen(m.p as [number, number]);
          if (x < -20 || x > size.w + 20 || y < -20 || y > size.h + 20) return null;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="4" fill="var(--bg)" stroke="oklch(0.5 0.02 250)" strokeWidth="1.5"/>
              <text x={x + 8} y={y + 3} fontFamily="JetBrains Mono" fontSize="10" fill="var(--fg-3)">{m.km}km</text>
            </g>
          );
        })}
        {(() => {
          const [sx, sy] = toScreen(ROUTE_PTS[0]);
          return (
            <g>
              <circle cx={sx} cy={sy} r="7" fill="oklch(0.78 0.16 150)" stroke="var(--bg)" strokeWidth="2"/>
              <text x={sx + 12} y={sy + 4} fontFamily="JetBrains Mono" fontSize="10" letterSpacing="1" fill="oklch(0.78 0.16 150)">START</text>
            </g>
          );
        })()}
        <g transform={`translate(${px} ${py})`}>
          <g transform={`rotate(${ang})`}>
            <circle r="22" fill={ACCENT} opacity="0.12"/>
            <circle r="14" fill={ACCENT} opacity="0.22"/>
            <circle r="7" fill={ACCENT} stroke="var(--bg)" strokeWidth="2.5"/>
            <path d="M0 -16 L6 -8 L-6 -8 Z" fill={ACCENT}/>
          </g>
          {/* Floating gradient tag — counter-rotates with marker so text stays upright */}
          <g transform="translate(20, -8)">
            <rect
              x={0} y={-12} rx={6} ry={6}
              width={62} height={22}
              fill="rgba(0,0,0,0.78)"
              stroke="var(--line-soft)"
              strokeWidth={1}
            />
            <text
              x={31} y={3}
              textAnchor="middle"
              fontFamily="JetBrains Mono"
              fontSize="11.5"
              fontWeight="600"
              fill={gradeColor}
            >
              {gradeSign}{currentGrade.toFixed(1)}%
            </text>
          </g>
        </g>
        <rect width="100%" height="100%" fill="url(#map-vignette)"/>
      </svg>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LivePage() {
  const router = useRouter();

  const power           = useBleStore(s => s.power);
  const powerSmoothed   = useBleStore(s => s.powerSmoothed);
  const cadence         = useBleStore(s => s.cadence);
  const hr              = useBleStore(s => s.hr);
  const hrSmoothed      = useBleStore(s => s.hrSmoothed);
  const speed           = useBleStore(s => s.speed);
  const elapsed         = useBleStore(s => s.elapsed);
  const distanceKm      = useBleStore(s => s.distanceKm);
  const ftp             = useBleStore(s => s.ftp);
  const smoothingSeconds = useBleStore(s => s.smoothingSeconds);
  const laps         = useBleStore(s => s.laps);
  const sessionPaused  = useBleStore(s => s.sessionPaused);
  const startSession   = useBleStore(s => s.startSession);
  const pauseSession   = useBleStore(s => s.pauseSession);
  const resumeSession  = useBleStore(s => s.resumeSession);
  const setGrade       = useBleStore(s => s.setGrade);
  const addLap         = useBleStore(s => s.addLap);

  const route     = useRouteStore(s => s.selectedRoute);
  const gpxPoints = useRouteStore(s => s.gpxPoints);

  const athlete = useAthleteStore(s => s.athlete);
  const maxHr   = athlete?.max_hr ?? 189;

  const hasGpx = gpxPoints !== null && gpxPoints.length > 0;

  const [devModalOpen, setDevModalOpen]   = useState(false);
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const wasRunningRef   = useRef(false);
  const lastGradeRef    = useRef<number | null>(null);
  const gradeTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start session timer on mount if not already running
  useEffect(() => {
    if (!useBleStore.getState().sessionStart) startSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grade tracking — debounced, only when GPX is available
  useEffect(() => {
    if (!hasGpx || sessionPaused) return;
    const grade = gradeAt(gpxPoints, distanceKm);
    if (Math.abs(grade - (lastGradeRef.current ?? grade + 1)) < 0.3) return;
    if (gradeTimerRef.current) clearTimeout(gradeTimerRef.current);
    gradeTimerRef.current = setTimeout(() => {
      setGrade(grade);
      lastGradeRef.current = grade;
    }, 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distanceKm, hasGpx, sessionPaused]);

  function openDeviceModal() {
    if (!useBleStore.getState().sessionPaused) {
      pauseSession();
      wasRunningRef.current = true;
    } else {
      wasRunningRef.current = false;
    }
    setDevModalOpen(true);
  }

  function closeDeviceModal() {
    setDevModalOpen(false);
    if (wasRunningRef.current) {
      resumeSession();
      wasRunningRef.current = false;
    }
  }

  // ── Time formatting ──────────────────────────────────────────────────────────
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const timeStr = elapsed >= 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;

  // ── Progress ─────────────────────────────────────────────────────────────────
  const routeDist    = route?.distance_km ?? (hasGpx ? (gpxPoints[gpxPoints.length - 1]?.distKm ?? 24.6) : 24.6);
  const routeTimeMin = route?.estimated_time_min ?? 58;
  const progress = distanceKm > 0
    ? Math.min(0.999, distanceKm / routeDist)
    : Math.min(0.999, elapsed / (routeTimeMin * 60));

  // ── Smoothed values for primary display ──────────────────────────────────────
  // When smoothingSeconds is 1, the rolling avg buffer is ~1s wide → effectively instant.
  // We still prefer the smoothed reading over raw `power`/`hr` to avoid sample-to-sample jitter.
  const powerDisplay = powerSmoothed != null ? Math.round(powerSmoothed) : power;
  const hrDisplay    = hrSmoothed    != null ? Math.round(hrSmoothed)    : hr;

  // ── Zone colors (live, matches design-system zones) ──────────────────────────
  const pZone = powerDisplay != null && powerDisplay > 0 ? getPowerZone(powerDisplay, ftp)         : null;
  const hZone = hrDisplay    != null && hrDisplay    > 0 ? getHrZone(hrDisplay, maxHr, athlete?.hr_zones) : null;
  const zonePct  = powerDisplay != null ? Math.min(100, (powerDisplay / ftp) / 1.5 * 100) : 0;
  const hrPct    = hrDisplay    != null ? Math.min(100, (hrDisplay / maxHr) * 100)       : 0;

  // ── Elevation / grade ────────────────────────────────────────────────────────
  const currentGrade = hasGpx
    ? gradeAt(gpxPoints, distanceKm)
    : (synthElevAt(Math.min(1, progress + 0.01)) - synthElevAt(Math.max(0, progress - 0.01))) * 20;

  const currentEle = hasGpx
    ? positionAt(gpxPoints, distanceKm).ele
    : null;

  // Elevation SVG path — real GPX data downsampled to 100pts, or synthetic
  const elevPoints: string = hasGpx
    ? (() => {
        const total = gpxPoints[gpxPoints.length - 1].distKm;
        const minEle = Math.min(...gpxPoints.map(p => p.ele));
        const maxEle = Math.max(...gpxPoints.map(p => p.ele));
        const range  = maxEle - minEle || 1;
        return Array.from({ length: 100 }, (_, i) => {
          const d   = (i / 99) * total;
          const pos = positionAt(gpxPoints, d);
          const y   = 100 - ((pos.ele - minEle) / range) * 92 - 4;
          return `${i === 0 ? 'M' : 'L'}${i} ${y.toFixed(1)}`;
        }).join(' ');
      })()
    : Array.from({ length: 100 }, (_, i) => {
        const t = i / 99;
        return `${i === 0 ? 'M' : 'L'}${(t * 100).toFixed(2)} ${(100 - synthElevAt(t) * 100).toFixed(2)}`;
      }).join(' ');

  const elevPct = hasGpx
    ? (() => {
        const minEle = Math.min(...gpxPoints.map(p => p.ele));
        const maxEle = Math.max(...gpxPoints.map(p => p.ele));
        const range  = maxEle - minEle || 1;
        return (currentEle! - minEle) / range;
      })()
    : synthElevAt(progress);

  const elevX = hasGpx
    ? (distanceKm / (gpxPoints[gpxPoints.length - 1].distKm || 1)) * 99
    : progress * 100;

  const elevY = 100 - elevPct * 92 - 4;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div className="live">

        {/* ── Map ─────────────────────────────────────────────────────────── */}
        {hasGpx
          ? <div className="map-canvas"><LiveMap points={gpxPoints} distanceKm={distanceKm} currentGrade={currentGrade}/></div>
          : <SyntheticMapCanvas progress={progress} currentGrade={currentGrade}/>
        }

        {/* ── Top overlays: route (L) · TIME centered (M) · distance (R) ──── */}
        <div className="live-top">
          <div className="left">
            <div className="ride-tag">
              <div className="name">{route?.name ?? 'Sessão livre'}</div>
              <div className="sub">{route?.location ?? 'Modo livre'} · {(progress * 100).toFixed(0)}% completo</div>
            </div>
          </div>

          {/* Time — protagonist of the top bar, big number, centered */}
          <div className="live-top-time">
            <div className="lbl">Tempo</div>
            <div className="v">{timeStr}</div>
            {sessionPaused && <div className="paused-pill">Pausado</div>}
          </div>

          <div className="right">
            <div className="ride-tag">
              <div className="sub">Distância</div>
              <div className="name" style={{ fontFamily: "'JetBrains Mono'", letterSpacing: '-0.02em' }}>
                {distanceKm.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 500, marginLeft: 4 }}>km</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Lap chip (auto-hides 8s after lap close) ─────────────────────── */}
        <div className="lap-chip-anchor">
          <LapChip laps={laps}/>
        </div>

        {/* ── Elevation track ──────────────────────────────────────────────── */}
        <div className="elev-track" style={{ bottom: 180 }}>
          <div className="lbl">{hasGpx && currentEle !== null ? `${Math.round(currentEle)} m` : 'Elevação'}</div>
          <div className="pos" style={{ color: currentGrade > 0 ? '#FF9F43' : currentGrade < -1 ? '#4ade80' : 'var(--fg-2)' }}>
            {currentGrade >= 0 ? '+' : ''}{currentGrade.toFixed(1)}%
          </div>
          <svg
            viewBox={hasGpx ? '0 0 99 100' : '0 0 100 100'}
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: '24px 0 0 0', width: '100%', height: 'calc(100% - 24px)' }}
          >
            <defs>
              <linearGradient id="elevLiveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.3"/>
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={`${elevPoints} L${hasGpx ? 99 : 100} 100 L0 100 Z`} fill="url(#elevLiveGrad)"/>
            <path d={elevPoints} stroke={ACCENT} strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke"/>
            <line
              x1={elevX} y1={elevY} x2={elevX} y2="100"
              stroke={ACCENT} strokeWidth="1.5" vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* ── HUD rail (Power + Cadence + HR + Speed) ─────────────────────── */}
        <div className="hud-rail">
          {/* Power — zone-coloured */}
          <div className="metric">
            <div className="lbl">
              <span>Potência</span>
              {pZone && <span style={{ color: pZone.color }}>{pZone.label} · {pZone.name}</span>}
            </div>
            <div className="v" style={{ color: pZone?.color ?? (powerDisplay != null ? 'var(--fg)' : 'var(--fg-3)') }}>
              {powerDisplay ?? '—'}
            </div>
            <div className="sub">
              <span>W · {smoothingSeconds}s</span>
              {powerDisplay != null && ftp > 0 && <span>{Math.round(powerDisplay / ftp * 100)}% FTP</span>}
            </div>
            {powerDisplay != null && (
              <div className="bar" style={{ width: `${zonePct}%`, background: pZone?.color ?? ACCENT }}/>
            )}
          </div>

          <div className="metric">
            <div className="lbl"><span>Cadência</span></div>
            <div className="v" style={{ color: cadence !== null ? 'var(--fg)' : 'var(--fg-3)' }}>
              {cadence ?? '—'}
            </div>
            <div className="sub"><span>rpm</span></div>
            {cadence !== null && <div className="bar" style={{ width: `${Math.min(100, cadence / 120 * 100)}%`, background: ACCENT }}/>}
          </div>

          {/* HR — zone-coloured */}
          <div className="metric">
            <div className="lbl">
              <span>Freq. Cardíaca</span>
              {hZone && <span style={{ color: hZone.color }}>{hZone.label} · {hZone.name}</span>}
            </div>
            <div className="v" style={{ color: hZone?.color ?? (hrDisplay != null ? 'var(--accent-2)' : 'var(--fg-3)') }}>
              {hrDisplay ?? '—'}
            </div>
            <div className="sub">
              <span>bpm · {smoothingSeconds}s</span>
              {hrDisplay != null && maxHr > 0 && <span>{Math.round(hrDisplay / maxHr * 100)}% FCmáx</span>}
            </div>
            {hrDisplay != null && (
              <div className="bar" style={{ width: `${hrPct}%`, background: hZone?.color ?? 'var(--accent-2)' }}/>
            )}
          </div>

          <div className="metric">
            <div className="lbl"><span>Velocidade</span></div>
            <div className="v" style={{ color: speed !== null ? 'var(--fg)' : 'var(--fg-3)' }}>
              {speed !== null ? speed.toFixed(1) : '—'}
            </div>
            <div className="sub"><span>km/h</span></div>
            {speed !== null && <div className="bar" style={{ width: `${Math.min(100, speed / 60 * 100)}%`, background: 'var(--accent-4)' }}/>}
          </div>
        </div>

        {/* ── Controls ─────────────────────────────────────────────────────── */}
        <div className="play-strip">
          <button onClick={() => sessionPaused ? resumeSession() : pauseSession()} title={sessionPaused ? 'Retomar' : 'Pausar'}>
            {sessionPaused ? <Icons.Play size={18}/> : <Icons.Pause size={18}/>}
          </button>
          <button className="primary" onClick={() => { pauseSession(); router.push('/summary'); }} title="Encerrar pedalada">
            <Icons.Stop size={14}/>
          </button>
          <button onClick={() => addLap('manual')} title="Marcar lap">
            <Icons.Flag size={16}/>
          </button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setSettingsOpen(o => !o)} title="Preferências do treino">
              <Icons.Settings size={16}/>
            </button>
            <LiveSettingsPopover open={settingsOpen} onClose={() => setSettingsOpen(false)}/>
          </div>
          <button onClick={openDeviceModal} title="Dispositivos">
            <Icons.Bluetooth size={16}/>
          </button>
        </div>
      </div>

      {devModalOpen && <DeviceModal onClose={closeDeviceModal}/>}
      <DisconnectModal/>
    </div>
  );
}
