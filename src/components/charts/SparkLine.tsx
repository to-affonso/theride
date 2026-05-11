/**
 * SparkLine — minimal inline chart for the history list.
 *
 * Pure SVG, no axes, no labels. Renders a smoothed area+line representation
 * of a power series. Cheap enough to render dozens per viewport.
 *
 * For richer time-series charts (post-ride, dashboard) use the uPlot wrapper.
 */

import { SERIES_COLORS } from './theme';

interface SparkLineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Number of points to downsample to. Lower = smoother but less detail. */
  resolution?: number;
}

export function SparkLine({
  data,
  width = 120,
  height = 28,
  color = SERIES_COLORS.power,
  resolution = 60,
}: SparkLineProps) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} role="img" aria-label="sem dados">
        <line
          x1={0} y1={height / 2} x2={width} y2={height / 2}
          stroke="var(--line-soft)" strokeWidth={1} strokeDasharray="3 3"
        />
      </svg>
    );
  }

  // Downsample to `resolution` points using simple bucket-mean
  const points = downsample(data, resolution);
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;

  // Build SVG path
  const n = points.length;
  const step = width / (n - 1);
  const yPad = 2;

  const path = points
    .map((v, i) => {
      const x = i * step;
      const y = height - yPad - ((v - min) / range) * (height - yPad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const areaPath = `${path} L${width.toFixed(1)} ${height} L0 ${height} Z`;

  const gradId = `spark-${Math.abs(hash(data.length + ':' + points[0]))}`;

  return (
    <svg width={width} height={height} role="img" aria-label="gráfico de potência">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0}   />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={path} stroke={color} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function downsample(arr: number[], target: number): number[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const out: number[] = [];
  for (let i = 0; i < target; i++) {
    const start = Math.floor(i * step);
    const end   = Math.floor((i + 1) * step);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += arr[j];
      count++;
    }
    out.push(count > 0 ? sum / count : 0);
  }
  return out;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}
