'use client';

/**
 * SplitsTable — per-km breakdown of a ride.
 *
 * Renders one row per kilometre with duration, avg power, HR, cadence and
 * speed. The power column shows a horizontal bar relative to the strongest
 * split — useful for spotting where the rider attacked vs cruised.
 *
 * Empty splits (no data) and rides under 1km are not rendered.
 */

import type { KmSplit } from '@/lib/splits';
import { formatClock } from '@/lib/format';

interface SplitsTableProps {
  splits: KmSplit[];
}

const ACCENT = '#D5FF00';

export function SplitsTable({ splits }: SplitsTableProps) {
  if (splits.length === 0) return null;

  const maxPower = Math.max(...splits.map(s => s.avgPower), 1);
  const fastestIdx = splits.reduce((best, s, i) => s.avgSpeed > splits[best].avgSpeed ? i : best, 0);
  const hardestIdx = splits.reduce((best, s, i) => s.avgPower > splits[best].avgPower ? i : best, 0);

  return (
    <div className="splits">
      <div className="splits-head">
        <span style={{ width: 44 }}>Km</span>
        <span style={{ width: 64 }}>Tempo</span>
        <span style={{ flex: 1 }}>Potência</span>
        <span style={{ width: 60, textAlign: 'right' }}>FC</span>
        <span style={{ width: 60, textAlign: 'right' }}>Cadência</span>
        <span style={{ width: 70, textAlign: 'right' }}>Velocidade</span>
      </div>
      {splits.map((s, i) => {
        const pctOfMax = (s.avgPower / maxPower) * 100;
        const isHardest = i === hardestIdx;
        const isFastest = i === fastestIdx;
        return (
          <div key={s.index} className="splits-row">
            <span className="splits-km" style={{ width: 44 }}>{s.index === splits.length - 1 && s.distanceKm % 1 !== 0
              ? s.distanceKm.toFixed(2)
              : s.distanceKm.toFixed(0)}</span>
            <span className="splits-time" style={{ width: 64 }}>{formatClock(s.durationS)}</span>
            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="splits-bar">
                <i style={{ width: `${pctOfMax}%`, background: isHardest ? ACCENT : 'rgba(213,255,0,0.4)' }}/>
              </span>
              <b style={{ minWidth: 40, textAlign: 'right', color: isHardest ? ACCENT : 'var(--fg)' }}>
                {s.avgPower > 0 ? `${s.avgPower}W` : '—'}
              </b>
            </span>
            <span className="splits-num" style={{ width: 60, textAlign: 'right' }}>
              {s.avgHr > 0 ? `${s.avgHr} bpm` : '—'}
            </span>
            <span className="splits-num" style={{ width: 60, textAlign: 'right' }}>
              {s.avgCadence > 0 ? `${s.avgCadence} rpm` : '—'}
            </span>
            <span className="splits-num" style={{ width: 70, textAlign: 'right', color: isFastest ? ACCENT : undefined }}>
              {s.avgSpeed > 0 ? `${s.avgSpeed.toFixed(1)} km/h` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
