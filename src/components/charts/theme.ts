/**
 * Chart theme — constants applied by all chart wrappers (uPlot, visx).
 *
 * Feature components should NEVER import uPlot/visx directly; they go
 * through wrappers in `src/components/charts/*` which automatically apply
 * this theme.
 *
 * Colors here mirror the design tokens in `globals.css`. If you change a
 * token there, update the corresponding entry here.
 */

import { POWER_ZONES, HR_ZONES } from '@/lib/zones';

/** Series colors — match design-system accent palette. */
export const SERIES_COLORS = {
  power:    '#D5FF00',   // --accent (lime)
  hr:       '#FF5A1F',   // --accent-2 (orange)
  cadence:  '#00D4E0',   // --accent-4 (cyan)
  speed:    '#E91E63',   // --accent-3 (magenta) — reserved
  gradient: '#6B6B6B',   // --fg-3 (subtle, used as area background)

  // Form chart (dashboard)
  ctl:      '#D5FF00',   // fitness = primary accent (positive)
  atl:      '#FF5A1F',   // fatigue = warning color
  tsb:      '#B8B8B8',   // form = neutral text gray
} as const;

/** Foreground colors mirroring text tokens. */
export const TEXT_COLORS = {
  primary:   '#FAFAFA',
  secondary: '#B8B8B8',
  tertiary:  '#6B6B6B',
} as const;

/** Background and grid. */
export const SURFACE_COLORS = {
  bg:       'transparent',     // charts inherit from card
  bgCard:   '#141414',
  bgInset:  '#0A0A0A',
  gridLine: '#2A2A2A',
  axisLine: '#6B6B6B',
} as const;

export const FONT = {
  family:        "'JetBrains Mono', ui-monospace, monospace",
  familyLabel:   "'Inter', ui-sans-serif, system-ui, sans-serif",
  sizeAxis:      10,
  sizeAxisLabel: 11,
  sizeLegend:    11.5,
  letterSpacing: '0.06em',
} as const;

/** Power-zone colors indexed by zone id, for use in distribution bars. */
export const POWER_ZONE_COLORS: Record<string, string> = Object.fromEntries(
  POWER_ZONES.map(z => [z.id, z.color]),
);

export const HR_ZONE_COLORS: Record<string, string> = Object.fromEntries(
  HR_ZONES.map(z => [z.id, z.color]),
);

/** Stroke widths (in px). */
export const STROKE = {
  line:    1.4,
  lineThick: 2,
  grid:    0.5,
  axis:    1,
} as const;

/** Default chart margins, in px. */
export const MARGIN = {
  top:    16,
  right:  16,
  bottom: 28,
  left:   44,
} as const;
