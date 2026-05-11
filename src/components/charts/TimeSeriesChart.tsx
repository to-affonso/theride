'use client';

/**
 * TimeSeriesChart — uPlot wrapper for session power + HR time series.
 *
 * Renders power (lime, left axis) and heart rate (orange, right axis) on
 * a shared canvas. Power is smoothed with a 5-second rolling average to
 * reduce sensor noise while preserving ride shape.
 *
 * Rules:
 * - Never instantiate uPlot outside useEffect (SSR safety).
 * - Always call plot.destroy() in the cleanup function.
 * - Width tracks the container via ResizeObserver.
 */

import { useEffect, useRef } from 'react';
import type uPlotLib from 'uplot';
import { SERIES_COLORS, FONT } from './theme';

interface TimeSeriesChartProps {
  powerSeries: number[];
  hrSeries: number[];
  /** Total session duration in seconds — used to label the X axis end. */
  durationSeconds: number;
  height?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** 5-point centered rolling average to reduce sensor noise. */
function smooth(arr: number[], win = 5): number[] {
  const half = Math.floor(win / 2);
  return arr.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j]; n++;
    }
    return sum / n;
  });
}

/** Linear interpolation resample to match a target length. */
function resample(arr: number[], len: number): number[] {
  if (arr.length === len) return arr;
  if (arr.length < 2)   return new Array(len).fill(arr[0] ?? 0);
  return Array.from({ length: len }, (_, i) => {
    const src = (i / (len - 1)) * (arr.length - 1);
    const lo  = Math.floor(src);
    const hi  = Math.min(arr.length - 1, lo + 1);
    return arr[lo] + (src - lo) * (arr[hi] - arr[lo]);
  });
}

/** Format seconds → "m:ss" or "Hhmm" for axis ticks. */
function fmtSecs(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TimeSeriesChart({
  powerSeries,
  hrSeries,
  durationSeconds,
  height = 240,
}: TimeSeriesChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef      = useRef<uPlotLib | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const hasPower = powerSeries.length > 1;
    const hasHR    = hrSeries.length > 1;
    if (!hasPower && !hasHR) return;

    let cancelled = false;

    (async () => {
      // Dynamic import — keeps uPlot out of the SSR bundle entirely.
      const [{ default: uPlot }] = await Promise.all([
        import('uplot'),
        // CSS: loaded once by Next.js bundler via side-effect import below.
      ]);

      if (cancelled || !containerRef.current) return;

      // Align series lengths.
      const len = Math.max(
        hasPower ? powerSeries.length : 0,
        hasHR    ? hrSeries.length    : 0,
      );

      const xs: number[] = Array.from({ length: len }, (_, i) => i);
      const data: uPlotLib.AlignedData = [xs];

      if (hasPower) data.push(smooth(powerSeries.length === len ? powerSeries : resample(powerSeries, len)));
      if (hasHR)    data.push(hrSeries.length === len ? hrSeries : resample(hrSeries, len));

      const w = containerRef.current.offsetWidth || 640;

      // Series — index 0 is always x.
      const series: uPlotLib.Series[] = [{}];
      if (hasPower) series.push({
        label:    'Potência',
        stroke:   SERIES_COLORS.power,
        width:    1.5,
        scale:    'W',
        spanGaps: true,
        fill:     (u) => {
          const ctx = u.ctx;
          const grad = ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height);
          grad.addColorStop(0,   'rgba(213,255,0,0.35)');
          grad.addColorStop(1,   'rgba(213,255,0,0)');
          return grad;
        },
      });
      if (hasHR) series.push({
        label:    'FC',
        stroke:   SERIES_COLORS.hr,
        width:    1.5,
        scale:    'bpm',
        spanGaps: true,
      });

      // Axes.
      const gridStyle = { stroke: '#222222', width: 0.5 };
      const tickStyle = { stroke: '#333333', width: 1, size: 4 };

      const axes: uPlotLib.Axis[] = [
        // X — time
        {
          stroke: '#6B6B6B',
          font:   `${FONT.sizeAxis}px ${FONT.family}`,
          ticks:  tickStyle,
          grid:   gridStyle,
          values: (_u, vals: number[]) => vals.map(v => fmtSecs(v)),
        },
      ];

      if (hasPower) axes.push({
        scale:  'W',
        side:   3,
        stroke: SERIES_COLORS.power,
        font:   `${FONT.sizeAxis}px ${FONT.family}`,
        ticks:  tickStyle,
        grid:   gridStyle,
        values: (_u, vals: (number | null)[]) =>
          vals.map(v => (v != null ? String(Math.round(v)) : '')),
        size: 42,
      });

      if (hasHR) axes.push({
        scale:  'bpm',
        side:   1,
        stroke: SERIES_COLORS.hr,
        font:   `${FONT.sizeAxis}px ${FONT.family}`,
        ticks:  tickStyle,
        grid:   { show: false },
        values: (_u, vals: (number | null)[]) =>
          vals.map(v => (v != null ? String(Math.round(v)) : '')),
        size: 42,
      });

      // Scales.
      const scales: Record<string, uPlotLib.Scale> = {
        x: { time: false, range: [0, len - 1] },
      };
      if (hasPower) scales['W']   = { auto: true };
      if (hasHR)    scales['bpm'] = { auto: true };

      const opts: uPlotLib.Options = {
        width:  w,
        height: height,
        padding: [
          8,                   // top
          hasHR    ? 42 : 12,  // right (HR axis)
          0,                   // bottom (handled by axis)
          hasPower ? 42 : 12,  // left (power axis)
        ],
        series,
        axes,
        scales,
        cursor: {
          drag:  { x: true, y: false },
          focus: { prox: 30 },
        },
        legend: { show: false },
        select: { show: false, left: 0, top: 0, width: 0, height: 0 },
      };

      const plot = new uPlot(opts, data, containerRef.current);
      plotRef.current = plot;

      // Resize tracking.
      const ro = new ResizeObserver(entries => {
        const newW = entries[0].contentRect.width;
        if (newW > 0 && plotRef.current) {
          plotRef.current.setSize({ width: newW, height });
        }
      });
      ro.observe(containerRef.current);

      // Store cleanup refs on the container element for the outer cleanup fn.
      (containerRef.current as any)._uplotRo = ro;
    })();

    return () => {
      cancelled = true;
      // ResizeObserver cleanup.
      const ro = (containerRef.current as any)?._uplotRo as ResizeObserver | undefined;
      ro?.disconnect();
      // uPlot cleanup.
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [powerSeries, hrSeries, durationSeconds, height]);

  const hasPower = powerSeries.length > 1;
  const hasHR    = hrSeries.length > 1;

  return (
    <div>
      {/* uPlot mounts its canvas here */}
      <div ref={containerRef} style={{ width: '100%' }}/>

      {/* Manual legend — uPlot's built-in legend is hidden */}
      <div style={{
        display:    'flex',
        gap:        18,
        marginTop:  10,
        fontSize:   11.5,
        color:      'var(--fg-2)',
        fontFamily: "'JetBrains Mono'",
      }}>
        {hasPower && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i style={{ width: 14, height: 2, background: SERIES_COLORS.power, display: 'inline-block', borderRadius: 1 }}/>
            Potência (W)
          </span>
        )}
        {hasHR && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i style={{ width: 14, height: 2, background: SERIES_COLORS.hr, display: 'inline-block', borderRadius: 1 }}/>
            FC (bpm)
          </span>
        )}
      </div>
    </div>
  );
}
