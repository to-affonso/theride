'use client';

/**
 * ElevationProfile — SVG area chart of elevation over distance.
 *
 * Mirrors RouteMap's split between traveled (lime fill) and remaining
 * (dim gray). Y-axis ticks show min/max elevation in metres.
 */

import { useMemo } from 'react';
import { scaleLinear } from '@visx/scale';
import type { GpxPoint } from '@/lib/gpx';
import { SERIES_COLORS, FONT } from './theme';
import { useContainerWidth } from './useContainerWidth';

interface ElevationProfileProps {
  points: GpxPoint[];
  distanceCoveredKm: number;
  height?: number;
}

export function ElevationProfile({ points, distanceCoveredKm, height = 140 }: ElevationProfileProps) {
  const { ref, width } = useContainerWidth<HTMLDivElement>(600);
  const margin = { top: 8, right: 12, bottom: 22, left: 36 };
  const innerW = width  - margin.left - margin.right;
  const innerH = height - margin.top  - margin.bottom;

  const data = useMemo(() => {
    if (points.length < 2 || innerW <= 0 || innerH <= 0) return null;
    const totalKm = points[points.length - 1].distKm || 1;
    let minEle =  Infinity, maxEle = -Infinity;
    for (const p of points) {
      if (p.ele < minEle) minEle = p.ele;
      if (p.ele > maxEle) maxEle = p.ele;
    }
    const eleRange = maxEle - minEle || 1;
    const padded = { min: minEle - eleRange * 0.08, max: maxEle + eleRange * 0.08 };

    const x = scaleLinear({ domain: [0, totalKm],            range: [0, innerW] });
    const y = scaleLinear({ domain: [padded.min, padded.max], range: [innerH, 0] });

    return { x, y, totalKm, minEle, maxEle };
  }, [points, innerW, innerH]);

  if (!data) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)', fontSize: 13, fontFamily: "'JetBrains Mono'" }}>
        Sem dados de elevação.
      </div>
    );
  }

  const { x, y, totalKm, minEle, maxEle } = data;
  const cover = Math.max(0, Math.min(distanceCoveredKm, totalKm));

  // Downsample for path performance (max ~200 vertices).
  const step = Math.max(1, Math.floor(points.length / 200));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  const allPath  = toPath(sampled, x, y);
  const baselineY = y(y.domain()[0]);
  const allArea  = `${allPath} L${x(totalKm).toFixed(1)},${baselineY.toFixed(1)} L0,${baselineY.toFixed(1)} Z`;

  // Traveled portion: same shape but clipped at coverage X
  const coverX = x(cover);
  const travelClipId = `elev-travel-clip-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`${travelClipId}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={SERIES_COLORS.power} stopOpacity="0.35"/>
            <stop offset="100%" stopColor={SERIES_COLORS.power} stopOpacity="0"/>
          </linearGradient>
          <clipPath id={travelClipId}>
            <rect x={0} y={0} width={coverX} height={innerH}/>
          </clipPath>
        </defs>

        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Baseline */}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="#333" strokeWidth={0.5}/>

          {/* Remaining (dim) */}
          <path d={allArea} fill="rgba(120,120,120,0.10)"/>
          <path d={allPath} fill="none" stroke="#555" strokeWidth={1}/>

          {/* Traveled (lime) — same path, clipped to coverX */}
          <g clipPath={`url(#${travelClipId})`}>
            <path d={allArea} fill={`url(#${travelClipId}-grad)`}/>
            <path d={allPath} fill="none" stroke={SERIES_COLORS.power} strokeWidth={1.4}/>
          </g>

          {/* Coverage marker */}
          {cover > 0 && cover < totalKm && (
            <line x1={coverX} x2={coverX} y1={0} y2={innerH} stroke={SERIES_COLORS.power} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.7}/>
          )}

          {/* Y axis labels (min / max only — keep it minimal) */}
          <text x={-6} y={4}      textAnchor="end" fill="#6B6B6B" fontSize={FONT.sizeAxis} fontFamily={FONT.family}>{Math.round(maxEle)}m</text>
          <text x={-6} y={innerH} textAnchor="end" fill="#6B6B6B" fontSize={FONT.sizeAxis} fontFamily={FONT.family}>{Math.round(minEle)}m</text>

          {/* X axis labels at 0, mid, end */}
          <text x={0}            y={innerH + 14} textAnchor="start"  fill="#6B6B6B" fontSize={FONT.sizeAxis} fontFamily={FONT.family}>0 km</text>
          <text x={innerW / 2}   y={innerH + 14} textAnchor="middle" fill="#6B6B6B" fontSize={FONT.sizeAxis} fontFamily={FONT.family}>{(totalKm / 2).toFixed(1)} km</text>
          <text x={innerW}       y={innerH + 14} textAnchor="end"    fill="#6B6B6B" fontSize={FONT.sizeAxis} fontFamily={FONT.family}>{totalKm.toFixed(1)} km</text>
        </g>
      </svg>
    </div>
  );
}

function toPath(pts: GpxPoint[], x: (n: number) => number, y: (n: number) => number): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.distKm).toFixed(1)},${y(p.ele).toFixed(1)}`).join(' ');
}
