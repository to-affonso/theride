'use client';

/**
 * LapChip — floating card that surfaces the most recently closed lap.
 *
 * Auto-hides after `displaySeconds` (default 8 s). When the underlying
 * `laps` array grows (new lap), the chip pops back in.
 */

import { useEffect, useState } from 'react';
import { Lap } from '@/types';

interface LapChipProps {
  laps:            Lap[];
  displaySeconds?: number;
}

const ACCENT = '#D5FF00';

export function LapChip({ laps, displaySeconds = 8 }: LapChipProps) {
  const [visible, setVisible] = useState(false);
  const last = laps[laps.length - 1];

  useEffect(() => {
    if (laps.length === 0) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), displaySeconds * 1000);
    return () => clearTimeout(t);
  }, [laps.length, displaySeconds]);

  if (!visible || !last) return null;

  const mm = Math.floor(last.durationS / 60);
  const ss = last.durationS % 60;

  return (
    <div className="lap-chip">
      <div className="lap-chip-head">
        <span className="lap-chip-idx">LAP {last.index}</span>
        {last.kind === 'auto' && <span className="lap-chip-kind">auto</span>}
      </div>
      <div className="lap-chip-row">
        <span className="lap-chip-num" style={{ color: ACCENT }}>
          {last.avgPower || '—'}<small>W</small>
        </span>
        <span className="lap-chip-num">
          {last.distanceKm.toFixed(2)}<small>km</small>
        </span>
        <span className="lap-chip-num">
          {mm}:{String(ss).padStart(2, '0')}
        </span>
        {last.avgHr != null && (
          <span className="lap-chip-num" style={{ color: 'var(--accent-2)' }}>
            {last.avgHr}<small>bpm</small>
          </span>
        )}
      </div>
    </div>
  );
}
