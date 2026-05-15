/**
 * HeroStat — big-number protagonist of a screen.
 *
 * Layout (left→right→bottom):
 *   ┌─ label ─┐    classification          highlight (PR / compare)
 *   │  value  │    recovery
 *   └─────────┘    secondary metrics (with optional tooltips)
 *   ─────────────────────────────────────────────────────
 *   spectrum bar (optional) — visual scale for the headline metric
 *
 * The spectrum bar is the key to making jargon-y metrics like TSS
 * self-explanatory: it shows where the value falls in the typical range,
 * with named bands.
 */

import { ReactNode } from 'react';

export interface HeroSpectrumBand {
  label: string;
  min: number;
  max: number;          // upper bound (exclusive). Use Infinity for the last band.
}

interface HeroStatProps {
  value: ReactNode;
  label: ReactNode;                // "TSS" — can be wrapped in <Tooltip>
  classification?: string;         // "Treino moderado-alto"
  recovery?: string;               // "Recuperação 36–48h"
  secondary?: ReactNode;           // children with secondary metrics
  highlight?: ReactNode;           // "↑ 4W melhor que sua última tentativa" — small chip
  highlightVariant?: 'positive' | 'neutral' | 'down';
  /** Prominent banner shown across the full width of the card. Use for high-impact
   *  signals (real PRs) where the small chip understates the moment. */
  prominentBadge?: ReactNode;
  /** Numeric value used to position the marker on the spectrum bar. */
  spectrumValue?: number;
  /** Bands shown on the spectrum bar (left to right). */
  spectrumBands?: HeroSpectrumBand[];
  /** Heading shown above the spectrum bar. */
  spectrumLabel?: string;
}

export function HeroStat({
  value,
  label,
  classification,
  recovery,
  secondary,
  highlight,
  highlightVariant = 'positive',
  prominentBadge,
  spectrumValue,
  spectrumBands,
  spectrumLabel = 'Escala',
}: HeroStatProps) {
  const showSpectrum = spectrumBands !== undefined && spectrumBands.length > 0 && spectrumValue !== undefined;

  return (
    <div className="hero-stat">
      <div className="hero-stat-main">
        <div className="hero-stat-left">
          <div className="hero-stat-label">{label}</div>
          <div className="hero-stat-value">{value}</div>
        </div>
        <div className="hero-stat-center">
          {classification && <div className="hero-stat-classification">{classification}</div>}
          {recovery && <div className="hero-stat-recovery">{recovery}</div>}
          {secondary && <div className="hero-stat-secondary">{secondary}</div>}
        </div>
        {highlight && !prominentBadge && (
          <div className="hero-stat-right">
            <div className={`hero-stat-highlight ${highlightVariant === 'positive' ? '' : highlightVariant}`}>
              {highlight}
            </div>
          </div>
        )}
      </div>

      {prominentBadge && (
        <div className="hero-stat-banner">{prominentBadge}</div>
      )}

      {showSpectrum && (
        <SpectrumBar value={spectrumValue!} bands={spectrumBands!} label={spectrumLabel}/>
      )}
    </div>
  );
}

function SpectrumBar({ value, bands, label }: { value: number; bands: HeroSpectrumBand[]; label: string }) {
  // Locate the band containing the value (last band catches anything ≥ its min).
  let activeIdx = bands.findIndex(b => value >= b.min && value < b.max);
  if (activeIdx === -1) activeIdx = value < bands[0].min ? 0 : bands.length - 1;

  // Compute marker position as % of overall bar width.
  // Each band is 1/N of the bar. Within a band, position by linear interpolation
  // (or clamp at end for unbounded last band).
  const bandWidth = 1 / bands.length;
  const band = bands[activeIdx];
  const range = band.max === Infinity ? band.min * 0.5 : band.max - band.min;
  const inBand = band.max === Infinity
    ? Math.min(0.85, (value - band.min) / range)
    : Math.max(0, Math.min(1, (value - band.min) / range));
  const positionPct = (activeIdx + inBand) * bandWidth * 100;

  // Extract numeric scale ticks (min of each band + max of last)
  const ticks = [
    ...bands.map(b => b.min),
    bands[bands.length - 1].max === Infinity ? `${bands[bands.length - 1].min}+` : bands[bands.length - 1].max,
  ];

  return (
    <div className="hero-spectrum">
      <div className="hero-spectrum-label">{label}</div>
      <div className="hero-spectrum-bar">
        {bands.map((b, i) => (
          <div key={i} className={`hero-spectrum-band ${i === activeIdx ? 'active' : ''}`}>
            {b.label}
          </div>
        ))}
        <div className="hero-spectrum-marker" style={{ left: `${positionPct}%` }}/>
      </div>
      <div className="hero-spectrum-scale">
        {ticks.map((t, i) => <span key={i}>{t}</span>)}
      </div>
    </div>
  );
}
