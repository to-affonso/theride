'use client';

/**
 * GpxThumbnail — real route polyline rendered from GPX coordinates.
 *
 * Projects (lat, lon) into the unit square via simple lat/lon scaling
 * (equirectangular — good enough at thumbnail size), preserving aspect
 * via `viewBox` letterboxing inside a 120×80 frame.
 *
 * The path is downsampled to ≤ 100 points to keep the SVG small even
 * for multi-thousand-point GPX traces.
 */

import { useMemo } from 'react';
import type { GpxPoint } from '@/lib/gpx';

interface GpxThumbnailProps {
  points: GpxPoint[];
  /** Stroke colour of the active route polyline. Default lime. */
  accent?: string;
}

const W = 120;
const H = 80;
const PAD = 8;

export function GpxThumbnail({ points, accent = '#D5FF00' }: GpxThumbnailProps) {
  const { path, start, end, key } = useMemo(() => {
    if (points.length < 2) {
      return { path: '', start: null as [number, number] | null, end: null as [number, number] | null, key: '' };
    }

    // Bounding box.
    let minLat =  Infinity, maxLat = -Infinity;
    let minLon =  Infinity, maxLon = -Infinity;
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    const dLat = maxLat - minLat || 1e-6;
    const dLon = maxLon - minLon || 1e-6;

    // Letterbox-preserving scale.
    const innerW = W - PAD * 2;
    const innerH = H - PAD * 2;
    const scaleX = innerW / dLon;
    const scaleY = innerH / dLat;
    const scale  = Math.min(scaleX, scaleY);
    const offsetX = PAD + (innerW - dLon * scale) / 2;
    const offsetY = PAD + (innerH - dLat * scale) / 2;

    function project(p: { lat: number; lon: number }): [number, number] {
      const x = offsetX + (p.lon - minLon) * scale;
      // Invert Y because SVG Y grows downward.
      const y = offsetY + (maxLat - p.lat) * scale;
      return [x, y];
    }

    // Downsample so the SVG path stays compact.
    const step = Math.max(1, Math.floor(points.length / 100));
    const sampled = points.filter((_, i) => i % step === 0);
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
      sampled.push(points[points.length - 1]);
    }

    const projected = sampled.map(project);
    const path = projected.map(([x, y], i) =>
      `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    ).join(' ');

    return {
      path,
      start: projected[0],
      end:   projected[projected.length - 1],
      // Cache key based on the first/last point and length — cheap.
      key: `${points.length}-${points[0].lat.toFixed(4)}-${points[points.length - 1].lat.toFixed(4)}`,
    };
  }, [points]);

  if (!path) return null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <pattern id={`gt-grid-${key}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 6L6 0" stroke="oklch(0.26 0.015 250)" strokeWidth="0.4"/>
        </pattern>
      </defs>
      <rect width={W} height={H} fill={`url(#gt-grid-${key})`}/>

      {/* Soft halo */}
      <path d={path} stroke={accent} strokeOpacity="0.18" strokeWidth="3.4"
            fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Main stroke */}
      <path d={path} stroke={accent} strokeWidth="1.6"
            fill="none" strokeLinecap="round" strokeLinejoin="round"/>

      {/* Start / finish markers */}
      {start && <circle cx={start[0]} cy={start[1]} r="2.2" fill="oklch(0.78 0.16 150)"/>}
      {end   && <circle cx={end[0]}   cy={end[1]}   r="2.2" fill={accent}/>}
    </svg>
  );
}
