'use client';

/**
 * LiveSettingsPopover — small floating panel for in-ride preferences.
 *
 * Controls (mirror /settings; changes here persist back to the athlete row):
 * - Power smoothing window (1 / 3 / 5 / 10 seconds, default 3)
 * - Auto-lap distance (off / 1 km / 2 km / 5 km / 10 km)
 *
 * Trigger is the caller's responsibility — typically the gear button in
 * the play-strip. The popover anchors itself absolutely above the trigger.
 */

import { useEffect, useRef } from 'react';
import { useBleStore } from '@/stores/bleStore';
import { useAthleteStore } from '@/stores/athleteStore';
import { createClient } from '@/lib/supabase/client';
import { PowerSmoothingSeconds } from '@/types';

interface LiveSettingsPopoverProps {
  open:    boolean;
  onClose: () => void;
}

const SMOOTHING_OPTIONS: PowerSmoothingSeconds[] = [1, 3, 5, 10];
const AUTO_LAP_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Off', value: null },
  { label: '1 km',  value: 1 },
  { label: '2 km',  value: 2 },
  { label: '5 km',  value: 5 },
  { label: '10 km', value: 10 },
];

export function LiveSettingsPopover({ open, onClose }: LiveSettingsPopoverProps) {
  const smoothingSeconds    = useBleStore(s => s.smoothingSeconds);
  const setSmoothingSeconds = useBleStore(s => s.setSmoothingSeconds);
  const autoLapKm           = useBleStore(s => s.autoLapKm);
  const setAutoLapKm        = useBleStore(s => s.setAutoLapKm);
  const athlete             = useAthleteStore(s => s.athlete);
  const updateAthlete       = useAthleteStore(s => s.updateAthlete);

  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Defer so the same click that opened the panel doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  /** Persist the local change back to the athlete row so /settings stays in sync. */
  function persist(patch: { power_smoothing_seconds?: PowerSmoothingSeconds; auto_lap_enabled?: boolean; auto_lap_distance_km?: number }) {
    if (!athlete) return;
    updateAthlete(patch);
    createClient().from('athletes').update(patch).eq('id', athlete.id).then(({ error }) => {
      if (error) console.error('Falha ao persistir preferências:', error.message);
    });
  }

  function changeSmoothing(s: PowerSmoothingSeconds) {
    setSmoothingSeconds(s);
    persist({ power_smoothing_seconds: s });
  }

  function changeAutoLap(km: number | null) {
    setAutoLapKm(km);
    if (km === null) {
      persist({ auto_lap_enabled: false });
    } else {
      persist({ auto_lap_enabled: true, auto_lap_distance_km: km });
    }
  }

  return (
    <div ref={panelRef} className="live-settings">
      <div className="live-settings-section">
        <div className="live-settings-label">Suavização da potência</div>
        <div className="live-settings-row">
          {SMOOTHING_OPTIONS.map(s => (
            <button
              key={s}
              className={`seg-btn ${smoothingSeconds === s ? 'active' : ''}`}
              onClick={() => changeSmoothing(s)}
            >
              {s}s
            </button>
          ))}
        </div>
        <div className="live-settings-hint">
          3s é o padrão da indústria — menos ruído na leitura.
        </div>
      </div>

      <div className="live-settings-section">
        <div className="live-settings-label">Auto-lap</div>
        <div className="live-settings-row">
          {AUTO_LAP_OPTIONS.map(opt => (
            <button
              key={String(opt.value)}
              className={`seg-btn ${autoLapKm === opt.value ? 'active' : ''}`}
              onClick={() => changeAutoLap(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
