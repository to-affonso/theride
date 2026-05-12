'use client';

/**
 * LiveSettingsPopover — small floating panel for in-ride preferences.
 *
 * Toggles:
 * - Smoothing window for power/HR readouts (1s vs 3s, default 3s)
 * - Auto-lap distance (off / 1 km / 5 km / 10 km)
 *
 * Trigger is the caller's responsibility — typically the gear button in
 * the play-strip. The popover anchors itself absolutely above the trigger.
 */

import { useEffect, useRef } from 'react';
import { useBleStore } from '@/stores/bleStore';

interface LiveSettingsPopoverProps {
  open:    boolean;
  onClose: () => void;
}

export function LiveSettingsPopover({ open, onClose }: LiveSettingsPopoverProps) {
  const smoothing    = useBleStore(s => s.smoothing);
  const setSmoothing = useBleStore(s => s.setSmoothing);
  const autoLapKm    = useBleStore(s => s.autoLapKm);
  const setAutoLapKm = useBleStore(s => s.setAutoLapKm);

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

  return (
    <div ref={panelRef} className="live-settings">
      <div className="live-settings-section">
        <div className="live-settings-label">Suavização</div>
        <div className="live-settings-row">
          <button
            className={`seg-btn ${smoothing === '1s' ? 'active' : ''}`}
            onClick={() => setSmoothing('1s')}
          >
            1s
          </button>
          <button
            className={`seg-btn ${smoothing === '3s' ? 'active' : ''}`}
            onClick={() => setSmoothing('3s')}
          >
            3s
          </button>
        </div>
        <div className="live-settings-hint">
          3s é o padrão da indústria — menos ruído na leitura.
        </div>
      </div>

      <div className="live-settings-section">
        <div className="live-settings-label">Auto-lap</div>
        <div className="live-settings-row">
          <button
            className={`seg-btn ${autoLapKm === null ? 'active' : ''}`}
            onClick={() => setAutoLapKm(null)}
          >
            Off
          </button>
          {[1, 5, 10].map(km => (
            <button
              key={km}
              className={`seg-btn ${autoLapKm === km ? 'active' : ''}`}
              onClick={() => setAutoLapKm(km)}
            >
              {km}km
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
