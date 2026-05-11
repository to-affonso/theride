'use client';

/**
 * ScatterCard — HR × Power scatter plot for aerobic decoupling analysis.
 *
 * Points are colour-coded by ride half:
 *   - First half: lime (same accent as power)
 *   - Second half: orange (same accent as HR)
 *
 * If the cloud drifts upward from left→right (same power, higher HR over
 * time), that's aerobic decoupling — the athlete is accumulating fatigue.
 * A tight, horizontal scatter indicates good aerobic efficiency.
 *
 * Built with @visx/scale + plain SVG — no runtime overhead.
 */

import { useMemo } from 'react';
import { scaleLinear } from '@visx/scale';
import { SERIES_COLORS, FONT } from './theme';

interface ScatterCardProps {
  /** Power values (W) — one per second. */
  powerSeries: number[];
  /** Heart rate values (bpm) — one per second. */
  hrSeries:    number[];
  width?:      number;
  height?:     number;
}

/** Sample down to max N points for scatter density. */
function sampleDown(arr: { x: number; y: number; half: 0 | 1 }[], maxN: number) {
  if (arr.length <= maxN) return arr;
  const step = arr.length / maxN;
  return Array.from({ length: maxN }, (_, i) => arr[Math.floor(i * step)]);
}

export function ScatterCard({
  powerSeries,
  hrSeries,
  width  = 360,
  height = 200,
}: ScatterCardProps) {
  const margin = { top: 12, right: 12, bottom: 36, left: 44 };
  const innerW = width  - margin.left  - margin.right;
  const innerH = height - margin.top   - margin.bottom;

  const points = useMemo(() => {
    const len = Math.min(powerSeries.length, hrSeries.length);
    if (len < 10) return [];
    const mid = Math.floor(len / 2);
    const raw = Array.from({ length: len }, (_, i) => ({
      x:    powerSeries[i],
      y:    hrSeries[i],
      half: (i < mid ? 0 : 1) as 0 | 1,
    })).filter(p => p.x > 0 && p.y > 0);
    return sampleDown(raw, 600);
  }, [powerSeries, hrSeries]);

  const xScale = useMemo(() => {
    if (points.length === 0) return scaleLinear({ domain: [0, 400], range: [0, innerW] });
    const xs = points.map(p => p.x);
    return scaleLinear({
      domain: [Math.max(0, Math.min(...xs) * 0.9), Math.max(...xs) * 1.05],
      range:  [0, innerW],
    });
  }, [points, innerW]);

  const yScale = useMemo(() => {
    if (points.length === 0) return scaleLinear({ domain: [60, 200], range: [innerH, 0] });
    const ys = points.map(p => p.y);
    return scaleLinear({
      domain: [Math.max(40, Math.min(...ys) * 0.95), Math.max(...ys) * 1.05],
      range:  [innerH, 0],
      nice:   true,
    });
  }, [points, innerH]);

  if (points.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)', fontSize: 13, fontFamily: "'JetBrains Mono'" }}>
        Dados insuficientes para análise.
      </div>
    );
  }

  const xTicks = xScale.ticks(4);
  const yTicks = yScale.ticks(4);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
      <g transform={`translate(${margin.left},${margin.top})`}>

        {/* Grid */}
        {yTicks.map(t => (
          <line key={t} x1={0} x2={innerW} y1={yScale(t)} y2={yScale(t)} stroke="#1E1E1E" strokeWidth={0.5}/>
        ))}
        {xTicks.map(t => (
          <line key={t} x1={xScale(t)} x2={xScale(t)} y1={0} y2={innerH} stroke="#1E1E1E" strokeWidth={0.5}/>
        ))}

        {/* Points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xScale(p.x)}
            cy={yScale(p.y)}
            r={2.2}
            fill={p.half === 0 ? SERIES_COLORS.power : SERIES_COLORS.hr}
            opacity={0.55}
          />
        ))}

        {/* X axis */}
        <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="#333333" strokeWidth={0.5}/>
        {xTicks.map(t => (
          <g key={t} transform={`translate(${xScale(t)},${innerH})`}>
            <line y1={0} y2={4} stroke="#444444" strokeWidth={1}/>
            <text y={14} textAnchor="middle" fill="#6B6B6B" fontSize={FONT.sizeAxis} fontFamily={FONT.family}>
              {Math.round(t)}
            </text>
          </g>
        ))}
        <text
          x={innerW / 2} y={innerH + 30}
          textAnchor="middle" fill="#6B6B6B"
          fontSize={FONT.sizeAxis} fontFamily={FONT.family}
        >
          Potência (W)
        </text>

        {/* Y axis */}
        <line x1={0} x2={0} y1={0} y2={innerH} stroke="#333333" strokeWidth={0.5}/>
        {yTicks.map(t => (
          <g key={t} transform={`translate(0,${yScale(t)})`}>
            <line x1={-4} x2={0} stroke="#444444" strokeWidth={1}/>
            <text x={-8} y={4} textAnchor="end" fill="#6B6B6B" fontSize={FONT.sizeAxis} fontFamily={FONT.family}>
              {Math.round(t)}
            </text>
          </g>
        ))}
        <text
          transform={`translate(-34,${innerH / 2}) rotate(-90)`}
          textAnchor="middle" fill="#6B6B6B"
          fontSize={FONT.sizeAxis} fontFamily={FONT.family}
        >
          FC (bpm)
        </text>

      </g>
    </svg>
  );
}
