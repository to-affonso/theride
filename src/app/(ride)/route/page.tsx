'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useRouteStore } from '@/stores/routeStore';
import { useAthleteStore } from '@/stores/athleteStore';
import { createClient } from '@/lib/supabase/client';
import { Route } from '@/types';
import { Icons } from '@/components/icons';
import { parseGpx, totalElevationGain, GpxPoint } from '@/lib/gpx';
import { loadLocalRoutes, saveLocalRoute, deleteLocalRoute } from '@/lib/localRoutes';
import { loadRouteStats, RouteStats, formatDurationShort } from '@/lib/routeStats';
import { routeBadge } from '@/lib/routeBadge';
import {
  RouteFilters,
  RouteFiltersState,
  DEFAULT_FILTERS,
} from '@/components/route/RouteFilters';
import { GpxThumbnail } from '@/components/route/GpxThumbnail';

const ACCENT = '#D5FF00';

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

// ── Filter helpers ────────────────────────────────────────────────────────────

function inDistance(km: number, b: RouteFiltersState['distance']): boolean {
  switch (b) {
    case '0-30':   return km <= 30;
    case '30-60':  return km > 30 && km <= 60;
    case '60-100': return km > 60 && km <= 100;
    case '100+':   return km > 100;
    default:       return true;
  }
}
function inElevation(m: number, b: RouteFiltersState['elevation']): boolean {
  switch (b) {
    case 'flat':     return m < 300;
    case 'mixed':    return m >= 300 && m <= 800;
    case 'mountain': return m > 800;
    default:         return true;
  }
}
function inDuration(min: number, b: RouteFiltersState['duration']): boolean {
  switch (b) {
    case '0-30':   return min <= 30;
    case '30-60':  return min > 30 && min <= 60;
    case '60-120': return min > 60 && min <= 120;
    case '120+':   return min > 120;
    default:       return true;
  }
}

function applyFilters(
  routes: Route[],
  filters: RouteFiltersState,
  stats: Record<string, RouteStats>,
): Route[] {
  const q = filters.search.trim().toLowerCase();

  const filtered = routes.filter(r => {
    if (!inDistance(r.distance_km, filters.distance))       return false;
    if (!inElevation(r.elevation_m, filters.elevation))     return false;
    if (!inDuration(r.estimated_time_min, filters.duration)) return false;
    if (filters.done === 'done' && !stats[r.id])             return false;
    if (filters.done === 'new'  && stats[r.id])              return false;
    if (q && !`${r.name} ${r.location}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // Sort.
  const out = [...filtered];
  switch (filters.sort) {
    case 'distance':   out.sort((a, b) => b.distance_km   - a.distance_km);   break;
    case 'elevation':  out.sort((a, b) => b.elevation_m   - a.elevation_m);   break;
    case 'difficulty': out.sort((a, b) => b.difficulty    - a.difficulty);    break;
    case 'most-used':  out.sort((a, b) => (stats[b.id]?.count ?? 0) - (stats[a.id]?.count ?? 0)); break;
    case 'recent':
    default:           out.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')); break;
  }
  return out;
}

// ── Route page ────────────────────────────────────────────────────────────────
export default function RoutePage() {
  const router = useRouter();
  const { routes, setRoutes, selectRoute, setGpxPoints } = useRouteStore();
  const athlete = useAthleteStore(s => s.athlete);

  const [active, setActive] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [dragging, setDragging] = useState(false);
  const [gpxError, setGpxError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [filters, setFilters] = useState<RouteFiltersState>(DEFAULT_FILTERS);
  const [stats,   setStats]   = useState<Record<string, RouteStats>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter  = useRef(0);

  useEffect(() => {
    const localRoutes = loadLocalRoutes();
    const supabase = createClient();
    supabase.from('routes').select('*').order('created_at').then(({ data }) => {
      const dbRoutes: Route[] = data ?? [];
      const dbIds = new Set(dbRoutes.map(r => r.id));
      const onlyLocal = localRoutes.filter(r => !dbIds.has(r.id));
      const merged = [...onlyLocal, ...dbRoutes];
      setRoutes(merged);
      setActive(merged[0]?.id ?? '');
      setLoading(false);
    });
  }, [setRoutes]);

  // Load per-route usage stats so we can show "Última: 1h47" & filter by "done".
  useEffect(() => {
    if (!athlete?.id) return;
    loadRouteStats(athlete.id).then(setStats);
  }, [athlete?.id]);

  const displayRoutes = routes;

  // Apply search/filter/sort. Memoised so 100 routes filter in < 1 ms.
  const visibleRoutes = useMemo(
    () => applyFilters(displayRoutes, filters, stats),
    [displayRoutes, filters, stats],
  );

  // Keep `active` valid if filters hide the current selection.
  useEffect(() => {
    if (visibleRoutes.length === 0) return;
    if (!visibleRoutes.find(r => r.id === active)) {
      setActive(visibleRoutes[0].id);
    }
  }, [visibleRoutes, active]);

  const r    = displayRoutes.find(x => x.id === active) ?? displayRoutes[0];
  const rIdx = displayRoutes.indexOf(r);
  const selectedGpx = r?.gpx_data?.points ?? null;

  async function handleGpxFile(file: File) {
    setGpxError(null);
    setSaveStatus('saving');
    try {
      const xml    = await file.text();
      const points = parseGpx(xml);
      const distKm = points[points.length - 1].distKm;
      const elevM  = totalElevationGain(points);
      const estMin = Math.round(distKm / 0.3);

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

      const withNew = [newRoute, ...displayRoutes];
      saveLocalRoute(newRoute);
      setRoutes(withNew);
      setActive(newRoute.id);

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

  // Page-wide drag-drop. We use dragCounter to avoid the flicker that
  // happens when the dragenter/leave bubble through child elements.
  function handlePageDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.types?.includes('Files')) setDragging(true);
  }
  function handlePageDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handlePageDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  }
  function handlePageDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.gpx')) handleGpxFile(file);
    else if (file) setGpxError('Apenas arquivos .gpx são suportados.');
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
    <div
      className="screen"
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {dragging && (
        <div className="route-drop-overlay">
          <div className="route-drop-overlay-inner">
            <Icons.Upload size={36} c={ACCENT}/>
            <div className="route-drop-overlay-title">Solte o arquivo .gpx</div>
            <div className="route-drop-overlay-sub">Importaremos a rota e mostraremos a prévia.</div>
          </div>
        </div>
      )}

      <div className="route">
        {/* ── Left column ────────────────────────────────────────────────── */}
        <div className="route-left">
          <div>
            <h1 className="h1">Escolha sua rota.</h1>
            <p className="lede">Modo livre. Pedale no seu ritmo — o smart trainer ajusta a resistência conforme a inclinação real do percurso.</p>
          </div>

          {/* Filters + search */}
          <RouteFilters
            value={filters}
            onChange={setFilters}
            visible={visibleRoutes.length}
            total={displayRoutes.length}
          />

          {/* GPX import button */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1 }}/>
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

          {/* Route list */}
          <div className="route-list">
            {loading && (
              <>
                <div className="route-skeleton"/>
                <div className="route-skeleton"/>
                <div className="route-skeleton"/>
                <div className="route-skeleton"/>
              </>
            )}

            {!loading && displayRoutes.length === 0 && (
              <div className="route-empty">
                <span>Nenhuma rota disponível ainda. Importe um arquivo .gpx para começar.</span>
              </div>
            )}

            {!loading && displayRoutes.length > 0 && visibleRoutes.length === 0 && (
              <div className="route-empty">
                <span>Nenhuma rota encontrada com esses filtros.</span>
                <button
                  className="auth-link-btn"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  style={{ marginTop: 6 }}
                >
                  Limpar filtros
                </button>
              </div>
            )}

            {!loading && visibleRoutes.map((rt, i) => {
              const badge = routeBadge(rt);
              const st    = stats[rt.id];
              return (
                <div
                  key={rt.id}
                  className={`route-item ${active === rt.id ? 'active' : ''}`}
                  onClick={() => setActive(rt.id)}
                >
                  <div className="route-thumb">
                    {rt.gpx_data?.points && rt.gpx_data.points.length > 1
                      ? <GpxThumbnail
                          points={rt.gpx_data.points}
                          accent={active === rt.id ? ACCENT : 'oklch(0.55 0.02 250)'}
                        />
                      : <MiniMap
                          seed={i + 1}
                          accent={active === rt.id ? ACCENT : 'oklch(0.55 0.02 250)'}
                        />}
                  </div>
                  <div className="route-info">
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {rt.name}
                      <span className={`route-badge tone-${badge.tone}`}>{badge.label}</span>
                      {rt.gpx_data && <span className="route-badge tone-gpx">GPX</span>}
                      {st && <span className="route-badge tone-done">✓ Já feita</span>}
                    </h4>
                    <div className="loc"><Icons.Pin size={12}/> {rt.location}</div>
                    <div className="route-stats">
                      <span><b>{rt.distance_km}</b> km</span>
                      <span><b>{rt.elevation_m}</b> m</span>
                      <span>{fmtTime(rt.estimated_time_min)}</span>
                      {st?.bestDurationS != null && (
                        <span className="route-last">
                          Melhor: <b>{formatDurationShort(st.bestDurationS)}</b>
                        </span>
                      )}
                      {st && st.count > 1 && (
                        <span className="route-last">
                          {st.count}× feita
                        </span>
                      )}
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
              );
            })}
          </div>
        </div>

        {/* ── Right column ───────────────────────────────────────────────── */}
        <div className="route-right">
          {loading && (
            <div className="route-detail">
              <div className="route-skeleton" style={{ height: 60 }}/>
              <div className="route-skeleton" style={{ height: 220 }}/>
              <div className="route-skeleton" style={{ height: 120 }}/>
              <div className="route-skeleton" style={{ height: 80 }}/>
            </div>
          )}
          {!loading && r && (
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

              {/* Last ride / best time — only when stats available */}
              {stats[r.id] && (
                <div className="route-history-strip">
                  <div className="route-history-item">
                    <div className="lbl">Última vez</div>
                    <div className="val">
                      {stats[r.id].lastAt
                        ? new Date(stats[r.id].lastAt!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                        : '—'}
                    </div>
                  </div>
                  <div className="route-history-item">
                    <div className="lbl">Melhor tempo</div>
                    <div className="val">
                      {stats[r.id].bestDurationS != null ? formatDurationShort(stats[r.id].bestDurationS!) : '—'}
                    </div>
                  </div>
                  <div className="route-history-item">
                    <div className="lbl">Vezes feita</div>
                    <div className="val">{stats[r.id].count}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="footer-actions">
            <button className="btn ghost" onClick={() => router.push('/settings')}>
              <Icons.Settings size={14}/> Dispositivos
            </button>
            <button className="btn primary lg" onClick={handleStart} disabled={!r}>
              Iniciar <Icons.Play size={14} c="#0A0A0A"/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
