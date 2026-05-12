/**
 * BatteryIndicator — compact battery glyph + percentage.
 *
 * Colour bands:
 *   ≥ 60 % → accent (lime)
 *   30–60 % → neutral text
 *   < 30 % → warn (orange)
 */

const ACCENT = '#D5FF00';

export function BatteryIndicator({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  const color =
    pct >= 60 ? ACCENT :
    pct >= 30 ? 'var(--fg-2)' :
    'var(--warn)';

  return (
    <div
      className="battery-indicator"
      title={`Bateria ${pct}%`}
      style={{ color }}
    >
      <svg width="22" height="11" viewBox="0 0 22 11" fill="none" aria-hidden="true">
        {/* Outer shell */}
        <rect
          x="0.5" y="0.5" width="18" height="10" rx="1.5"
          stroke="currentColor" strokeWidth="1" fill="none"
        />
        {/* Cap */}
        <rect x="19.5" y="3" width="2" height="5" rx="0.5" fill="currentColor"/>
        {/* Fill */}
        <rect
          x="2" y="2"
          width={Math.max(1, (pct / 100) * 15)}
          height="7" rx="0.5"
          fill="currentColor"
        />
      </svg>
      <span className="battery-indicator-pct">{pct}%</span>
    </div>
  );
}
