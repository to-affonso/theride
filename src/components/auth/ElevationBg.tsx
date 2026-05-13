'use client';

/**
 * ElevationBg — slow horizontal-scroll elevation silhouette behind the
 * auth card. Two stitched copies of the same path scroll left forever,
 * giving an "endless ride" feel without GIF/video assets.
 *
 * Pure inline SVG + CSS keyframes (`.auth-bg-scroll`). No JS animation
 * loops, no canvas — just a transform on the parent `<g>`.
 */

const ACCENT = '#D5FF00';

/** A pre-computed silhouette path (rolling hills with some steep bits). */
const ELEV_PATH = (() => {
  // Generate a deterministic path on a 1000×200 unit grid.
  const pts: [number, number][] = [];
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const y =
      120
      + Math.sin(t * Math.PI * 2.4)        * 36
      + Math.sin(t * Math.PI * 7.1 + 1.3)  * 14
      + Math.sin(t * Math.PI * 13.5 + 0.7) * 7;
    pts.push([t * 1000, Math.max(40, Math.min(190, y))]);
  }
  const head = `M${pts[0][0]} ${pts[0][1].toFixed(1)}`;
  const body = pts.slice(1).map(([x, y]) => `L${x} ${y.toFixed(1)}`).join(' ');
  // Close it into a filled area down to the baseline.
  return { line: `${head} ${body}`, fill: `${head} ${body} L1000 200 L0 200 Z` };
})();

export function ElevationBg() {
  return (
    <div className="auth-bg">
      <svg
        className="auth-bg-svg auth-bg-scroll"
        viewBox="0 0 2000 200"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="elevBgFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={ACCENT} stopOpacity="0.14"/>
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/*
         * Two stitched copies, each spanning a full viewport-width worth of
         * SVG units (1000). The SVG element itself is sized at 200% of the
         * container and translated left by -50% of its own width per loop —
         * which equals exactly one copy, keeping the right edge always
         * covered. See `.auth-bg-svg` / `auth-bg-pan` in globals.css.
         */}
        {/* Copy 1 — 0..1000 */}
        <path d={ELEV_PATH.fill} fill="url(#elevBgFill)"/>
        <path d={ELEV_PATH.line} stroke={ACCENT} strokeWidth="1.3" fill="none" opacity="0.45"/>

        {/* Copy 2 — 1000..2000 (translated, identical) */}
        <g transform="translate(1000 0)">
          <path d={ELEV_PATH.fill} fill="url(#elevBgFill)"/>
          <path d={ELEV_PATH.line} stroke={ACCENT} strokeWidth="1.3" fill="none" opacity="0.45"/>
        </g>

        {/* Sky grid lines for depth (static) */}
        <g opacity="0.06" stroke="#FFFFFF" strokeWidth="0.5">
          <line x1="0" x2="2000" y1="60"  y2="60"/>
          <line x1="0" x2="2000" y1="100" y2="100"/>
          <line x1="0" x2="2000" y1="140" y2="140"/>
        </g>
      </svg>
    </div>
  );
}
