'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useRouteStore } from '@/stores/routeStore';
import { createClient } from '@/lib/supabase/client';
import { Route } from '@/types';
import { Icons } from '@/components/icons';
import { parseGpx, totalElevationGain, GpxPoint } from '@/lib/gpx';
import { loadLocalRoutes, saveLocalRoute, deleteLocalRoute } from '@/lib/localRoutes';

const ACCENT = '#D5FF00';

// ── Static fallback routes ────────────────────────────────────────────────────
const STATIC_ROUTES: Route[] = [
  { id:'r1', name:'Estrada Real — Tiradentes', location:'Minas Gerais, BR',   distance_km:24.6, elevation_m:412, estimated_time_min:58,  difficulty:3, type:'Hills',     created_at:'' },
  { id:'r2', name:'Volta ao Lago Negro',        location:'Bariloche, AR',      distance_km:18.2, elevation_m:188, estimated_time_min:42,  difficulty:2, type:'Recovery',  created_at:'' },
  { id:'r3', name:'Subida do Stelvio (parcial)',location:'Lombardia, IT',      distance_km:11.4, elevation_m:864, estimated_time_min:72,  difficulty:5, type:'Climb',     created_at:'' },
  { id:'r4', name:'Costa do Sol — Búzios',      location:'Rio de Janeiro, BR', distance_km:32.0, elevation_m:240, estimated_time_min:65,  difficulty:2, type:'Endurance', created_at:'' },
  { id:'r5', name:'Pyrenees Sprint',            location:'Catalunya, ES',      distance_km:8.4,  elevation_m:120, estimated_time_min:22,  difficulty:3, type:'Sprint',    created_at:'' },
];

function fmtTime(min: number) {
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `~${h}h${m ? String(m).padStart(2, '0') : ''}`;
}

// ── Mini map (synthetic, used for static routes without GPX) ──────────────────
function MiniMap({ seed, accent }: { seed: number; accent: string }) {
  const pts: [number, number][] = [];
  let x = 6, y = 40 + (seed * 7 % 20);
  for (let i = 0; i < 14; i++) {
    pts.push([x, y]);
    x += 8;
    y += Math.sin(seed + i * 0.7) * 8;
    y = Math.max(8, Math.min(72, y));
  }
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1].toFixed(2)}`).join(' ');
  return (
    <svg viewBox="0 0 120 80">
      <defs>
        <pattern id={`g${seed}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 6L6 0" stroke="oklch(0.26 0.015 250)" strokeWidth="0.4"/>
        </pattern>
      </defs>
      <rect width="120" height="80" fill={`url(#g${seed})`}/>
      <path d={path} stroke={accent} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <circle cx={pts[0][0]} cy={pts[0][1]} r="2" fill="oklch(0.78 0.16 150)"/>
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2" fill={accent}/>
    </svg>
  );
}

function ElevProfile({ accent, seed }: { accent: string; seed: number }) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 80; i++) {
    const t = i / 79;
    const v = Math.sin(t * Math.PI * 2.2 + seed) * 0.4
            + Math.sin(t * Math.PI * 5 + seed * 1.3) * 0.18
            + 0.5 + t * 0.1;
    pts.push([t * 100, 100 - Math.max(8, Math.min(92, v * 100))]);
  }
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width:'100%', height:'100%' }}>
      <defs>
        <linearGradient id={`elevGrad${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={accent} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${d} L100 100 L0 100 Z`} fill={`url(#elevGrad${seed})`}/>
      <path d={d} stroke={accent} strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke"/>
    </svg>
  );
}

// ── Leaflet preview map (client-only) ─────────────────────────────────────────
const GpxPreviewMap = dynamic(() => import('@/components/GpxPreviewMap'), { ssr: false });

// ── GPX elevation profile (from real data) ────────────────────────────────────
function GpxElevProfile({ points, accent }: { points: GpxPoint[]; accent: string }) {
  if (points.length < 2) return null;
  const minEle = Math.min(...points.map(p => p.ele));
  const maxEle = Math.max(...points.map(p => p.ele));
  const range  = maxEle - minEle || 1;
  const step   = Math.max(1, Math.floor(points.length / 80));
  const sampled = points.filter((_, i) => i % step === 0);
  const d = sampled.map((p, i) => {
    const x = (i / (sampled.length - 1)) * 100;
    const y = 100 - ((p.ele - minEle) / range) * 84 - 8;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="gpxElevGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={accent} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${d} L100 100 L0 100 Z`} fill="url(#gpxElevGrad)"/>
      <path d={d} stroke={accent} strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke"/>
    </svg>
  );
}

// ── Route page ────────────────────────────────────────────────────────────────
export default function RoutePage() {
  const router = useRouter();
  const { routes, setRoutes, selectRoute, setGpxPoints } = useRouteStore();
  const [active, setActive] = useState<string>('');
  const [dragging, setDragging] = useState(false);
  const [gpxError, setGpxError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const localRoutes = loadLocalRoutes();
    const supabase = createClient();
    supabase.from('routes').select('*').order('created_at').then(({ data }) => {
      const dbRoutes: Route[] = (data && data.length > 0) ? data : STATIC_ROUTES;
      // Merge: local GPX routes first (exclude any that were already synced to DB)
      const dbIds = new Set(dbRoutes.map(r => r.id));
      const onlyLocal = localRoutes.filter(r => !dbIds.has(r.id));
      const merged = [...onlyLocal, ...dbRoutes];
      setRoutes(merged);
      setActive(merged[0]?.id ?? '');
    });
  }, [setRoutes]);

  const displayRoutes = routes.length > 0 ? routes : STATIC_ROUTES;
  const r    = displayRoutes.find(x => x.id === active) ?? displayRoutes[0];
  const rIdx = displayRoutes.indexOf(r);

  // GPX points for the selected route (if any)
  const selectedGpx = r?.gpx_data?.points ?? null;

  async function handleGpxFile(file: File) {
    setGpxError(null);
    setSaveStatus('saving');
    try {
      const xml    = await file.text();
      const points = parseGpx(xml);
      const distKm = points[points.length - 1].distKm;
      const elevM  = totalElevationGain(points);
      const estMin = Math.round(distKm / 0.3); // ~18 km/h avg

      const newRoute: Route = {
        id:                 `gpx-${Date.now()}`,
        name:               file.name.replace(/\.gpx$/i, '').replace(/[-_]/g, ' '),
        location:           'GPX Import',
        distance_km:        Math.round(distKm * 10) / 10,
        elevation_m:        elevM,
        estimated_time_min: estMin,
        difficulty:         elevM > 600 ? 5 : elevM > 300 ? 4 : elevM > 150 ? 3 : 2,
        type:               'Hills',
        gpx_data:           { points },
        created_at:         new Date().toISOString(),
      };

      // Always save locally first — works offline and without auth
      const withNew = [newRoute, ...displayRoutes];
      saveLocalRoute(newRoute);
      setRoutes(withNew);
      setActive(newRoute.id);

      // Try to sync to Supabase; if it works, replace the local ID with the DB uuid
      const supabase = createClient();
      const { data: inserted, error } = await supabase.from('routes').insert({
        name:               newRoute.name,
        location:           newRoute.location,
        distance_km:        newRoute.distance_km,
        elevation_m:        newRoute.elevation_m,
        estimated_time_min: newRoute.estimated_time_min,
        difficulty:         newRoute.difficulty,
        type:               newRoute.type,
        gpx_data:           { points },
      }).select().single();

      if (!error && inserted) {
        // Replace the temp local route with the DB-assigned one
        const synced: Route = { ...newRoute, id: inserted.id, created_at: inserted.created_at };
        deleteLocalRoute(newRoute.id);
        saveLocalRoute(synced);
        setRoutes(withNew.map(rt => rt.id === newRoute.id ? synced : rt));
        setActive(synced.id);
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (e) {
      setSaveStatus('error');
      setGpxError((e as Error).message);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.gpx')) handleGpxFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleGpxFile(file);
    e.target.value = '';
  }

  async function handleDeleteRoute(id: string) {
    deleteLocalRoute(id);
    const supabase = createClient();
    await supabase.from('routes').delete().eq('id', id);
    const remaining = displayRoutes.filter(r => r.id !== id);
    setRoutes(remaining);
    if (active === id) setActive(remaining[0]?.id ?? '');
  }

  function handleStart() {
    selectRoute(r);
    setGpxPoints(r?.gpx_data?.points ?? null);
    router.push('/live');
  }

  return (
    <div className="screen">
      <div className="route">
        {/* ── Left column ────────────────────────────────────────────────── */}
        <div className="route-left">
          <div>
            <h1 className="h1">Escolha sua rota.</h1>
            <p className="lede">Modo livre. Pedale no seu ritmo — o smart trainer ajusta a resistência conforme a inclinação real do percurso.</p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="pill" style={{ background: 'var(--bg-3)' }}>Todas · {displayRoutes.length}</div>
            <div style={{ flex: 1 }}/>
            {/* GPX upload button */}
            <button
              className="pill"
              onClick={() => saveStatus === 'idle' && fileInputRef.current?.click()}
              disabled={saveStatus === 'saving'}
              style={{
                cursor: saveStatus === 'saving' ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                opacity: saveStatus === 'saving' ? 0.6 : 1,
                ...(saveStatus === 'saved' ? { color: ACCENT, borderColor: ACCENT } : {}),
                ...(saveStatus === 'error' ? { color: 'var(--warn)' } : {}),
              }}
            >
              {saveStatus === 'saving' && <span style={{ fontSize: 10 }}>●</span>}
              {saveStatus === 'saved'  && <Icons.Upload size={12}/>}
              {saveStatus === 'error'  && <span style={{ fontSize: 10 }}>✕</span>}
              {saveStatus === 'idle'   && <Icons.Upload size={12}/>}
              {saveStatus === 'saving' ? 'Salvando…'
               : saveStatus === 'saved'  ? 'Salvo!'
               : saveStatus === 'error'  ? 'Erro ao salvar'
               : 'Importar GPX'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </div>

          {gpxError && (
            <div style={{ fontSize: 11, color: 'var(--warn)', fontFamily: "'JetBrains Mono'", padding: '6px 10px', background: 'rgba(255,90,31,0.07)', borderRadius: 6, border: '1px solid rgba(255,90,31,0.2)' }}>
              {gpxError}
            </div>
          )}

          {/* Route list + drag-drop zone */}
          <div
            className="route-list"
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={dragging ? { outline: `2px dashed ${ACCENT}`, outlineOffset: -2, borderRadius: 10 } : undefined}
          >
            {dragging && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: 'rgba(10,10,10,0.75)', borderRadius: 10,
                fontFamily: "'JetBrains Mono'", fontSize: 12, color: ACCENT, letterSpacing: '0.1em',
              }}>
                Solte o arquivo .gpx aqui
              </div>
            )}
            {displayRoutes.map((rt, i) => (
              <div key={rt.id} className={`route-item ${active === rt.id ? 'active' : ''}`} onClick={() => setActive(rt.id)}>
                <div className="route-thumb">
                  <MiniMap seed={i + 1} accent={active === rt.id ? ACCENT : 'oklch(0.55 0.02 250)'}/>
                </div>
                <div className="route-info">
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {rt.name}
                    {rt.gpx_data && (
                      <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", letterSpacing: '0.1em', textTransform: 'uppercase', color: ACCENT, background: 'rgba(213,255,0,0.1)', padding: '1px 5px', borderRadius: 3, border: `1px solid ${ACCENT}33` }}>
                        GPX
                      </span>
                    )}
                  </h4>
                  <div className="loc"><Icons.Pin size={12}/> {rt.location} · {rt.type}</div>
                  <div className="route-stats">
                    <span><b>{rt.distance_km}</b> km</span>
                    <span><b>{rt.elevation_m}</b> m de elevação</span>
                    <span>{fmtTime(rt.estimated_time_min)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <div className={`difficulty d${rt.difficulty}`}>
                    {Array.from({ length: 5 }).map((_, k) => <i key={k}/>)}
                  </div>
                  {active === rt.id && <Icons.Arrow size={14} c={ACCENT}/>}
                  {rt.gpx_data && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteRoute(rt.id); }}
                      title="Remover rota"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--fg-3)', fontSize: 11, padding: '2px 4px', lineHeight: 1,
                        fontFamily: "'JetBrains Mono'",
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right column ───────────────────────────────────────────────── */}
        <div className="route-right">
          {r && (
            <div className="route-detail">
              <div>
                <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 8 }}>
                  Selecionada
                </div>
                <h2 className="h2">{r.name}</h2>
                <div style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icons.Pin size={12}/> {r.location}
                </div>
              </div>

              {/* Map preview — real Leaflet for GPX routes, SVG for static */}
              <div className="preview-map" style={{ overflow: 'hidden', borderRadius: 8 }}>
                {selectedGpx
                  ? <GpxPreviewMap points={selectedGpx}/>
                  : (
                    <svg viewBox="0 0 460 240" style={{ width: '100%', height: '100%' }}>
                      <defs>
                        <pattern id="mapgrid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M0 0 L0 20 M0 0 L20 0" stroke="oklch(0.24 0.012 250)" strokeWidth="0.5"/>
                        </pattern>
                      </defs>
                      <rect width="460" height="240" fill="url(#mapgrid)"/>
                      <path d="M40 200 Q 80 150, 130 160 T 220 120 Q 280 90, 320 110 T 420 60" stroke={ACCENT} strokeWidth="3" fill="none" strokeLinecap="round"/>
                      <path d="M40 200 Q 80 150, 130 160 T 220 120 Q 280 90, 320 110 T 420 60" stroke={ACCENT} strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.15"/>
                      <circle cx="40" cy="200" r="6" fill="oklch(0.78 0.16 150)" stroke="var(--bg)" strokeWidth="2"/>
                      <circle cx="420" cy="60" r="6" fill={ACCENT} stroke="var(--bg)" strokeWidth="2"/>
                      <text x="50" y="220" fill="var(--fg-3)" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1">START</text>
                      <text x="378" y="50" fill="var(--fg-3)" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1">FINISH</text>
                    </svg>
                  )
                }
              </div>

              {/* Elevation profile */}
              <div className="preview-elev">
                <div className="lbl">Perfil de elevação · {r.elevation_m}m</div>
                <div style={{ position: 'absolute', inset: '24px 14px 6px' }}>
                  {selectedGpx
                    ? <GpxElevProfile points={selectedGpx} accent={ACCENT}/>
                    : <ElevProfile accent={ACCENT} seed={rIdx + 1}/>
                  }
                </div>
              </div>

              <div className="stat-grid">
                <div className="stat-cell"><div className="lbl">Distância</div><div className="val">{r.distance_km}<small>km</small></div></div>
                <div className="stat-cell"><div className="lbl">Elevação</div><div className="val">{r.elevation_m}<small>m</small></div></div>
                <div className="stat-cell"><div className="lbl">Dificuldade</div><div className="val">{r.difficulty}<small>/5</small></div></div>
                <div className="stat-cell"><div className="lbl">Duração est.</div><div className="val">{fmtTime(r.estimated_time_min).replace('~', '')}</div></div>
              </div>
            </div>
          )}

          <div className="footer-actions">
            <button className="btn ghost" onClick={() => router.push('/pair')}>
              <Icons.Settings size={14}/> Dispositivos
            </button>
            <button className="btn primary lg" onClick={handleStart}>
              Iniciar <Icons.Play size={14} c="#0A0A0A"/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
