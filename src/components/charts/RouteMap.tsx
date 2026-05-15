'use client';

/**
 * RouteMap — minimal SVG map of the planned route.
 *
 * Renders the route line on a dark canvas (no tiles). Lat/lon are projected
 * with simple equirectangular projection, corrected for latitude distortion.
 * The portion of the route the athlete actually covered is drawn in lime;
 * the remainder is dimmed. A pulse dot marks the current/final position.
 *
 * No actual GPS recording is needed — the route is the planned GPX and the
 * progress marker is interpolated from `distanceCoveredKm`.
 */

import { useMemo } from 'react';
import type { GpxPoint } from '@/lib/gpx';
import { SERIES_COLORS } from './theme';
import { useContainerWidth } from './useContainerWidth';

interface RouteMapProps {
  points: GpxPoint[];
  /** Distance the athlete actually covered (km). 0..totalKm. */
  distanceCoveredKm: number;
  height?: number;
}

interface Projected { x: number; y: number; distKm: number }

export function RouteMap({ points, distanceCoveredKm, height = 240 }: RouteMapProps) {
  const { ref, width } = useContainerWidth<HTMLDivElement>(600);

  const projection = useMemo(() => projectPoints(points, width, height), [points, width, height]);

  if (points.length < 2 || projection.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)', fontSize: 13, fontFamily: "'JetBrains Mono'" }}>
        Sem dados de mapa para esta sessão.
      </div>
    );
  }

  // Split projected points into traveled vs remaining at the coverage boundary.
  const totalKm = points[points.length - 1].distKm;
  const cover   = Math.max(0, Math.min(distanceCoveredKm, totalKm));
  const cutIdx  = findIndexAtDistance(projection, cover);

  const traveled = projection.slice(0, cutIdx + 1);
  const remaining = projection.slice(cutIdx);

  const traveledPath  = toPath(traveled);
  const remainingPath = toPath(remaining);

  const start  = projection[0];
  const finish = projection[projection.length - 1];
  const cursor = interpolateAt(projection, cover);

  const coverPct = totalKm > 0 ? Math.round((cover / totalKm) * 100) : 0;

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
        {/* Remaining route — dim baseline */}
        <path d={remainingPath} fill="none" stroke="#3A3A3A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
        {/* Traveled portion — lime accent */}
        <path d={traveledPath} fill="none" stroke={SERIES_COLORS.power} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"/>

        {/* Start marker */}
        <circle cx={start.x} cy={start.y} r={4} fill="#0A0A0A" stroke="#FAFAFA" strokeWidth={1.5}/>

        {/* End marker (route terminus) — small dim ring */}
        <circle cx={finish.x} cy={finish.y} r={3.5} fill="#0A0A0A" stroke="#666" strokeWidth={1.2}/>

        {/* Current/progress cursor */}
        {cover > 0 && cover < totalKm && (
          <>
            <circle cx={cursor.x} cy={cursor.y} r={9} fill={SERIES_COLORS.power} opacity={0.25}/>
            <circle cx={cursor.x} cy={cursor.y} r={5} fill={SERIES_COLORS.power}/>
          </>
        )}
      </svg>

      <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 11, color: 'var(--fg-3)', fontFamily: "'JetBrains Mono'" }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 8, height: 8, borderRadius: '50%', background: '#FAFAFA', border: '1px solid #FAFAFA', display: 'inline-block' }}/>
          Início
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 14, height: 2, background: SERIES_COLORS.power, display: 'inline-block', borderRadius: 1 }}/>
          Percorrido ({coverPct}%)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 14, height: 2, background: '#3A3A3A', display: 'inline-block', borderRadius: 1 }}/>
          Restante
        </span>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function projectPoints(points: GpxPoint[], width: number, height: number): Projected[] {
  if (points.length < 2 || width <= 0 || height <= 0) return [];

  // Bounding box
  let minLat =  Infinity, maxLat = -Infinity;
  let minLon =  Infinity, maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  // Equirectangular projection with cosine correction for latitude.
  const midLat = (minLat + maxLat) / 2;
  const kx = Math.cos(midLat * Math.PI / 180);
  const dxRange = (maxLon - minLon) * kx || 1e-6;
  const dyRange = (maxLat - minLat)      || 1e-6;

  // Fit into viewBox with padding, preserving aspect ratio.
  const pad = 16;
  const availW = width  - pad * 2;
  const availH = height - pad * 2;
  const scale = Math.min(availW / dxRange, availH / dyRange);
  const offsetX = (width  - dxRange * scale) / 2;
  const offsetY = (height - dyRange * scale) / 2;

  return points.map(p => ({
    x: offsetX + ((p.lon - minLon) * kx) * scale,
    y: offsetY + (maxLat - p.lat) * scale,
    distKm: p.distKm,
  }));
}

function findIndexAtDistance(arr: Projected[], distKm: number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid].distKm <= distKm) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function interpolateAt(arr: Projected[], distKm: number): { x: number; y: number } {
  if (arr.length === 0) return { x: 0, y: 0 };
  if (distKm <= arr[0].distKm) return arr[0];
  const last = arr[arr.length - 1];
  if (distKm >= last.distKm) return last;
  const i = findIndexAtDistance(arr, distKm);
  const a = arr[i];
  const b = arr[Math.min(i + 1, arr.length - 1)];
  if (b.distKm === a.distKm) return a;
  const t = (distKm - a.distKm) / (b.distKm - a.distKm);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function toPath(pts: Projected[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}
