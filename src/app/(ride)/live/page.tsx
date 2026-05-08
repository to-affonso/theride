'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBleStore } from '@/stores/bleStore';
import { useRouteStore } from '@/stores/routeStore';
import { Icons } from '@/components/icons';
import { DeviceModal } from '@/components/DeviceModal';
import LiveMap from '@/components/LiveMap';
import { gradeAt, positionAt } from '@/lib/gpx';

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

function SyntheticMapCanvas({ progress }: { progress: number }) {
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
        <g transform={`translate(${px} ${py}) rotate(${ang})`}>
          <circle r="22" fill={ACCENT} opacity="0.12"/>
          <circle r="14" fill={ACCENT} opacity="0.22"/>
          <circle r="7" fill={ACCENT} stroke="var(--bg)" strokeWidth="2.5"/>
          <path d="M0 -16 L6 -8 L-6 -8 Z" fill={ACCENT}/>
        </g>
        <rect width="100%" height="100%" fill="url(#map-vignette)"/>
      </svg>
    </div>
  );
}

// ── Power zones ───────────────────────────────────────────────────────────────
const ZONE_CONFIG = [
  { label: 'Z1', color: 'oklch(0.5 0.05 250)',  max: 0.55 },
  { label: 'Z2', color: 'oklch(0.7 0.14 180)',  max: 0.75 },
  { label: 'Z3', color: 'oklch(0.78 0.18 60)',  max: 0.90 },
  { label: 'Z4', color: 'oklch(0.7 0.2 340)',   max: 1.05 },
  { label: 'Z5', color: 'oklch(0.65 0.22 25)',  max: 1.20 },
  { label: 'Z6', color: ACCENT,                  max: 99   },
];

function getPowerZone(power: number, ftp: number) {
  const pct = power / ftp;
  return ZONE_CONFIG.find(z => pct < z.max) ?? ZONE_CONFIG[5];
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LivePage() {
  const router = useRouter();

  const power        = useBleStore(s => s.power);
  const cadence      = useBleStore(s => s.cadence);
  const hr           = useBleStore(s => s.hr);
  const speed        = useBleStore(s => s.speed);
  const elapsed      = useBleStore(s => s.elapsed);
  const distanceKm   = useBleStore(s => s.distanceKm);
  const ftp          = useBleStore(s => s.ftp);
  const sessionPaused  = useBleStore(s => s.sessionPaused);
  const startSession   = useBleStore(s => s.startSession);
  const pauseSession   = useBleStore(s => s.pauseSession);
  const resumeSession  = useBleStore(s => s.resumeSession);
  const setGrade       = useBleStore(s => s.setGrade);

  const route     = useRouteStore(s => s.selectedRoute);
  const gpxPoints = useRouteStore(s => s.gpxPoints);

  const hasGpx = gpxPoints !== null && gpxPoints.length > 0;

  const [devModalOpen, setDevModalOpen] = useState(false);
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

  // ── Progress ─────────────────────────────────────────────────────────────────
  const routeDist    = route?.distance_km ?? (hasGpx ? (gpxPoints[gpxPoints.length - 1]?.distKm ?? 24.6) : 24.6);
  const routeTimeMin = route?.estimated_time_min ?? 58;
  const progress = distanceKm > 0
    ? Math.min(0.999, distanceKm / routeDist)
    : Math.min(0.999, elapsed / (routeTimeMin * 60));

  // ── Metrics ──────────────────────────────────────────────────────────────────
  const zone    = power !== null ? getPowerZone(power, ftp) : null;
  const zonePct  = power !== null ? Math.min(100, (power / ftp) / 1.5 * 100) : 0;

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

  // x position of current location on elevation SVG (0–100)
  const elevX = hasGpx
    ? (distanceKm / (gpxPoints[gpxPoints.length - 1].distKm || 1)) * 99
    : progress * 100;

  const elevY = 100 - elevPct * 92 - 4;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div className="live">

        {/* ── Map ─────────────────────────────────────────────────────────── */}
        {hasGpx
          ? <div className="map-canvas"><LiveMap points={gpxPoints} distanceKm={distanceKm}/></div>
          : <SyntheticMapCanvas progress={progress}/>
        }

        {/* ── Top overlays ─────────────────────────────────────────────────── */}
        <div className="live-top">
          <div className="left">
            <div className="ride-tag">
              <div className="name">{route?.name ?? 'Sessão livre'}</div>
              <div className="sub">{route?.location ?? 'Modo livre'} · {(progress * 100).toFixed(0)}% completo</div>
            </div>
          </div>

          <div className="ride-tag" style={{ pointerEvents: 'none' }}>
            <div className="sub">Distância</div>
            <div className="name" style={{ fontFamily: "'JetBrains Mono'", letterSpacing: '-0.02em' }}>
              {distanceKm.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 500, marginLeft: 4 }}>km</span>
            </div>
          </div>

          <div className="right">
            <div className="ride-tag">
              <div className="sub">Tempo</div>
              <div className="name" style={{ fontFamily: "'JetBrains Mono'", letterSpacing: '-0.02em' }}>
                {elapsed >= 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`}
              </div>
            </div>
          </div>
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

        {/* ── HUD rail ─────────────────────────────────────────────────────── */}
        <div className="hud-rail">
          <div className="metric" style={{ color: zone?.color ?? 'var(--fg)' }}>
            <div className="lbl">
              <span>Potência</span>
              {zone && <span>{zone.label}</span>}
            </div>
            <div className="v" style={{ color: power !== null ? zone?.color ?? ACCENT : 'var(--fg-3)' }}>
              {power ?? '—'}
            </div>
            <div className="sub">
              <span>W</span>
              {power !== null && ftp > 0 && <span>{Math.round(power / ftp * 100)}% FTP</span>}
            </div>
            {power !== null && <div className="bar" style={{ width: `${zonePct}%`, color: zone?.color }}/>}
          </div>

          <div className="metric">
            <div className="lbl"><span>Cadência</span></div>
            <div className="v" style={{ color: cadence !== null ? 'var(--fg)' : 'var(--fg-3)' }}>
              {cadence ?? '—'}
            </div>
            <div className="sub"><span>rpm</span></div>
            {cadence !== null && <div className="bar" style={{ width: `${Math.min(100, cadence / 120 * 100)}%`, color: ACCENT }}/>}
          </div>

          <div className="metric" style={{ color: 'var(--accent-2)' }}>
            <div className="lbl"><span>Freq. Cardíaca</span></div>
            <div className="v" style={{ color: hr !== null ? 'var(--accent-2)' : 'var(--fg-3)' }}>
              {hr ?? '—'}
            </div>
            <div className="sub"><span>bpm</span></div>
            {hr !== null && <div className="bar" style={{ width: `${Math.min(100, hr / 189 * 100)}%`, color: 'var(--accent-2)' }}/>}
          </div>

          <div className="metric">
            <div className="lbl"><span>Velocidade</span></div>
            <div className="v" style={{ color: speed !== null ? 'var(--fg)' : 'var(--fg-3)' }}>
              {speed !== null ? speed.toFixed(1) : '—'}
            </div>
            <div className="sub"><span>km/h</span></div>
            {speed !== null && <div className="bar" style={{ width: `${Math.min(100, speed / 60 * 100)}%`, color: 'var(--accent-4)' }}/>}
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
          <button onClick={openDeviceModal} title="Dispositivos">
            <Icons.Settings size={16}/>
          </button>
        </div>
      </div>

      {devModalOpen && <DeviceModal onClose={closeDeviceModal}/>}
    </div>
  );
}
