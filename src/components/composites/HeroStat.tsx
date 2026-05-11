/**
 * HeroStat — big-number protagonist of a screen.
 *
 * Used on post-ride and history detail to put TSS (or any metric)
 * front-and-center. Right side carries secondary metrics, classification,
 * recovery estimate, and an optional comparison highlight strip.
 */

import { ReactNode } from 'react';

interface HeroStatProps {
  value: ReactNode;                // The big number (or string like "82")
  label: string;                   // "TSS"
  secondary?: ReactNode;           // "IF 0.81 · NP 246W"
  classification?: string;         // "Treino moderado-alto"
  recovery?: string;               // "Recuperação 36-48h"
  highlight?: string | null;       // "↑ 4W melhor que sua última tentativa"
  highlightVariant?: 'positive' | 'neutral' | 'down';
}

export function HeroStat({
  value,
  label,
  secondary,
  classification,
  recovery,
  highlight,
  highlightVariant = 'positive',
}: HeroStatProps) {
  return (
    <div className="hero-stat">
      <div className="hero-stat-left">
        <div className="hero-stat-value">{value}</div>
        <div className="hero-stat-label">{label}</div>
      </div>
      <div className="hero-stat-right">
        {secondary && <div className="hero-stat-secondary">{secondary}</div>}
        {classification && <div className="hero-stat-classification">{classification}</div>}
        {recovery && <div className="hero-stat-recovery">{recovery}</div>}
        {highlight && (
          <div className={`hero-stat-highlight ${highlightVariant === 'positive' ? '' : highlightVariant}`}>
            {highlight}
          </div>
        )}
      </div>
    </div>
  );
}
