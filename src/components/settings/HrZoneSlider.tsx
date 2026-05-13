'use client';

/**
 * HrZoneSlider — full-width 7-zone HR slider with 6 draggable handles.
 *
 *  ┌────┬──────┬─────┬───┬───┬───┬─┐
 *  │ Z1 │  Z2  │ Z3  │Z4 │Z5 │Z6 │Z7│
 *  └────┴──────┴─────┴───┴───┴───┴─┘
 *
 * Each handle adjusts the upper bound of the preceding zone, as a
 * fraction of `maxHr`. Handles are clamped so the array stays
 * monotonically increasing.
 *
 * Drag is local; the parent receives the final bounds via `onChange`
 * on pointer release (and only if values actually changed). This
 * keeps Supabase writes to one per drag.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildHrZones, DEFAULT_HR_ZONE_BOUNDS } from '@/lib/zones';

interface HrZoneSliderProps {
  /** Length-6 array of upper bounds for Z1..Z6 as fractions of maxHr. */
  bounds: number[];
  /** Athlete's max HR (bpm) — used only to render bpm labels. */
  maxHr:  number;
  /** Called when the user releases the pointer after dragging. */
  onChange: (next: number[]) => void;
}

/** Minimum gap between adjacent bounds (1% of MaxHR). */
const MIN_GAP = 0.01;

export function HrZoneSlider({ bounds, maxHr, onChange }: HrZoneSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Local working copy of the bounds. Synced from props when not dragging.
  const [working, setWorking] = useState<number[]>(bounds);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);
  const initialOnDragRef = useRef<number[] | null>(null);

  // Re-sync when props change and we're not actively dragging.
  useEffect(() => {
    if (activeHandle === null) setWorking(bounds);
  }, [bounds, activeHandle]);

  const zones = useMemo(() => buildHrZones(working), [working]);

  function fractionAt(clientX: number): number {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0.01, Math.min(0.99, x / rect.width));
  }

  function clamp(idx: number, raw: number, arr: number[]): number {
    const lo = idx === 0 ? MIN_GAP : arr[idx - 1] + MIN_GAP;
    const hi = idx === arr.length - 1 ? 1 - MIN_GAP : arr[idx + 1] - MIN_GAP;
    return Math.max(lo, Math.min(hi, raw));
  }

  function onHandlePointerDown(idx: number) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      initialOnDragRef.current = [...working];
      setActiveHandle(idx);
    };
  }

  function onHandlePointerMove(idx: number) {
    return (e: React.PointerEvent) => {
      if (activeHandle !== idx) return;
      const f = fractionAt(e.clientX);
      setWorking(prev => {
        const next = [...prev];
        next[idx] = clamp(idx, f, next);
        return next;
      });
    };
  }

  function onHandlePointerUp(idx: number) {
    return (e: React.PointerEvent) => {
      if (activeHandle !== idx) return;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      setActiveHandle(null);
      // Emit only if changed vs. the snapshot at drag start.
      const before = initialOnDragRef.current ?? bounds;
      const changed = working.some((v, i) => Math.abs(v - before[i]) > 1e-4);
      initialOnDragRef.current = null;
      if (changed) onChange([...working]);
    };
  }

  function resetDefaults() {
    const def = [...DEFAULT_HR_ZONE_BOUNDS];
    setWorking(def);
    onChange(def);
  }

  // Build segment widths (0..1 fractions). Last segment goes from working[5] to 1.
  const segments = useMemo(() => {
    const w = [...working, 1];
    return zones.map((z, i) => {
      const start = i === 0 ? 0 : w[i - 1];
      const end   = w[i];
      return { z, start, end, width: end - start };
    });
  }, [working, zones]);

  return (
    <div className="hr-zone-slider-wrap">
      <div className="hr-zone-slider" ref={trackRef}>
        {segments.map(({ z, width }) => (
          <div
            key={z.id}
            className="hr-zone-segment"
            style={{ flex: `${Math.max(0.0001, width)} 0 0`, background: z.color }}
            data-zone={z.id}
          >
            <span className="hr-zone-segment-label">{z.label}</span>
          </div>
        ))}

        {working.map((b, idx) => (
          <button
            key={idx}
            className={`hr-zone-handle ${activeHandle === idx ? 'dragging' : ''}`}
            style={{ left: `${b * 100}%` }}
            aria-label={`Limite superior da Z${idx + 1}`}
            type="button"
            onPointerDown={onHandlePointerDown(idx)}
            onPointerMove={onHandlePointerMove(idx)}
            onPointerUp={onHandlePointerUp(idx)}
            onPointerCancel={onHandlePointerUp(idx)}
          />
        ))}
      </div>

      <div className="hr-zone-legend">
        {segments.map(({ z, end }, i) => {
          const pct = Math.round(end * 100);
          const bpm = maxHr > 0 ? Math.round(end * maxHr) : null;
          return (
            <div key={z.id} className="hr-zone-legend-item" style={{ flex: `${Math.max(0.0001, segments[i].width)} 0 0` }}>
              <div className="hr-zone-legend-pct">{pct}%</div>
              {bpm != null && <div className="hr-zone-legend-bpm">{bpm} bpm</div>}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="hr-zone-reset"
        onClick={resetDefaults}
        title="Restaurar zonas padrão (Friel 7-zone)"
      >
        Restaurar padrão
      </button>
    </div>
  );
}
