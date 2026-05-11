'use client';

/**
 * PowerCurve — Mean-Max Power (MMP) curve.
 *
 * Shows the current session's best power at each duration alongside the
 * athlete's all-time historical best. PR windows are highlighted with a
 * filled dot and a lime border.
 *
 * X axis: log scale (5 s → 60 min), showing 6 labelled windows.
 * Y axis: linear (watts).
 *
 * Built with @visx/scale + plain SVG paths — no heavy runtime.
 */

import { useMemo } from 'react';
import { scaleLog, scaleLinear } from '@visx/scale';
import type { BestPower, MmpKey } from '@/lib/metrics';
import { SERIES_COLORS, FONT, MARGIN } from './theme';

interface PowerCurveProps {
  current:    BestPower;
  historical: BestPower;
  prs:        MmpKey[];
  height?:    number;
  width?:     number;
}

/** Ordered windows: label, seconds */
const WINDOWS: { key: MmpKey; label: string; secs: number }[] = [
  { key: '5s',    label: '5s',   secs: 5    },
  { key: '30s',   label: '30s',  secs: 30   },
  { key: '1min',  label: '1min', secs: 60   },
  { key: '5min',  label: '5min', secs: 300  },
  { key: '20min', label: '20m',  secs: 1200 },
  { key: '60min', label: '60m',  secs: 3600 },
];

const ACCENT = '#D5FF00';

export function PowerCurve({
  current,
  historical,
  prs,
  height = 200,
  width  = 600,
}: PowerCurveProps) {
  const margin = { ...MARGIN, left: 48, bottom: 32, top: 12, right: 16 };
  const innerW = width  - margin.left - margin.right;
  const innerH = height - margin.top  - margin.bottom;

  // Only include windows where at least one dataset has data.
  const windows = WINDOWS.filter(w => current[w.key] != null || historical[w.key] != null);

  const allWatts = [
    ...windows.flatMap(w => [current[w.key], historical[w.key]]),
  ].filter((v): v is number => v != null);

  const maxW  = allWatts.length > 0 ? Math.max(...allWatts) * 1.08 : 500;
  const minW  = allWatts.length > 0 ? Math.max(0, Math.min(...allWatts) * 0.88) : 0;

  const xScale = useMemo(() => scaleLog({
    domain: [windows[0]?.secs ?? 5, windows[windows.length - 1]?.secs ?? 3600],
    range:  [0, innerW],
    clamp:  true,
  }), [innerW, windows]);

  const yScale = useMemo(() => scaleLinear({
    domain: [minW, maxW],
    range:  [innerH, 0],
    nice:   true,
  }), [innerH, maxW, minW]);

  // Build SVG path from (secs, watts) pairs.
  function toPath(pts: { secs: number; w: number }[]): string {
    return pts.map(({ secs, w }, i) =>
      `${i === 0 ? 'M' : 'L'}${xScale(secs).toFixed(1)},${yScale(w).toFixed(1)}`
    ).join(' ');
  }

  const curPts  = windows.filter(w => current[w.key]    != null).map(w => ({ secs: w.secs, w: current[w.key]!    }));
  const histPts = windows.filter(w => historical[w.key] != null).map(w => ({ secs: w.secs, w: historical[w.key]! }));

  // Y gridlines.
  const yTicks = yScale.ticks(4);

  if (windows.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)', fontSize: 13, fontFamily: "'JetBrains Mono'" }}>
        Sem dados de curva de potência.
      </div>
    );
  }

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
      <g transform={`translate(${margin.left},${margin.top})`}>

        {/* Grid lines */}
        {yTicks.map(t => (
          <line
            key={t}
            x1={0} x2={innerW}
            y1={yScale(t)} y2={yScale(t)}
            stroke="#222222" strokeWidth={0.5}
          />
        ))}

        {/* Historical best (dim background line) */}
        {histPts.length > 1 && (
          <path
            d={toPath(histPts)}
            fill="none"
            stroke="#555555"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}

        {/* Current session line */}
        {curPts.length > 1 && (
          <path
            d={toPath(curPts)}
            fill="none"
            stroke={SERIES_COLORS.power}
            strokeWidth={2}
          />
        )}

        {/* PR dots */}
        {windows.map(w => {
          const cur = current[w.key];
          const isPr = prs.includes(w.key);
          if (cur == null) return null;
          const cx = xScale(w.secs);
          const cy = yScale(cur);
          return (
            <g key={w.key}>
              <circle
                cx={cx} cy={cy} r={isPr ? 5.5 : 3.5}
                fill={isPr ? ACCENT : '#1A1A1A'}
                stroke={isPr ? ACCENT : SERIES_COLORS.power}
                strokeWidth={isPr ? 0 : 1.5}
              />
              {isPr && (
                <circle
                  cx={cx} cy={cy} r={9}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={1}
                  opacity={0.4}
                />
              )}
            </g>
          );
        })}

        {/* Historical dots */}
        {histPts.map(({ secs, w }) => (
          <circle
            key={secs}
            cx={xScale(secs)} cy={yScale(w)} r={3}
            fill="#333333"
            stroke="#555555"
            strokeWidth={1}
          />
        ))}

        {/* X axis — window labels */}
        {windows.map(w => (
          <g key={w.key} transform={`translate(${xScale(w.secs)},${innerH})`}>
            <line y1={0} y2={6} stroke="#444444" strokeWidth={1}/>
            <text
              y={18}
              textAnchor="middle"
              fill="#6B6B6B"
              fontSize={FONT.sizeAxis}
              fontFamily={FONT.family}
            >
              {w.label}
            </text>
          </g>
        ))}

        {/* Y axis labels */}
        {yTicks.map(t => (
          <text
            key={t}
            x={-8}
            y={yScale(t) + 4}
            textAnchor="end"
            fill="#6B6B6B"
            fontSize={FONT.sizeAxis}
            fontFamily={FONT.family}
          >
            {Math.round(t)}
          </text>
        ))}

        {/* Y axis label */}
        <text
          transform={`translate(-36,${innerH / 2}) rotate(-90)`}
          textAnchor="middle"
          fill="#6B6B6B"
          fontSize={FONT.sizeAxis}
          fontFamily={FONT.family}
        >
          W
        </text>

        {/* X axis baseline */}
        <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="#333333" strokeWidth={0.5}/>
        {/* Y axis line */}
        <line x1={0} x2={0} y1={0} y2={innerH} stroke="#333333" strokeWidth={0.5}/>

      </g>
    </svg>
  );
}
