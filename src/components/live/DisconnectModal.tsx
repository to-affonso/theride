'use client';

/**
 * DisconnectModal — alert shown when a BLE sensor drops mid-session.
 *
 * Behaviour:
 * - Appears immediately when the store sets `disconnectAlert`.
 * - While `reconnecting:true`, shows a spinner-style "Reconectando…" message
 *   (the store is already running auto-retry in the background).
 * - When auto-retry exhausts and `reconnecting:false`, surfaces a manual
 *   "Reconectar" button that calls `reconnect(type)`.
 * - "Dispensar" closes the popup without retrying — useful for HR sensors
 *   the rider doesn't need to finish the workout.
 */

import { useBleStore } from '@/stores/bleStore';
import { Icons } from '@/components/icons';
import type { DeviceType } from '@/types';

const LABELS: Record<DeviceType, string> = {
  trainer: 'Smart Trainer',
  cadence: 'Sensor de cadência',
  speed:   'Sensor de velocidade',
  hr:      'Monitor cardíaco',
};

export function DisconnectModal() {
  const alert             = useBleStore(s => s.disconnectAlert);
  const reconnect         = useBleStore(s => s.reconnect);
  const dismissDisconnect = useBleStore(s => s.dismissDisconnect);

  if (!alert) return null;

  return (
    <div className="disconnect-overlay" role="alertdialog" aria-live="assertive">
      <div className="disconnect-modal">
        <div className="disconnect-icon">
          <Icons.Warning size={28}/>
        </div>
        <h2 className="disconnect-title">
          {LABELS[alert.type]} desconectado
        </h2>
        <p className="disconnect-sub">
          {alert.name && <span className="disconnect-name">{alert.name}</span>}
          {alert.reconnecting
            ? 'Tentando reconectar automaticamente…'
            : 'Não conseguimos restabelecer a conexão.'}
        </p>
        <div className="disconnect-actions">
          <button
            className="btn primary"
            onClick={() => reconnect(alert.type)}
            disabled={alert.reconnecting}
          >
            {alert.reconnecting ? 'Reconectando…' : 'Reconectar'}
          </button>
          <button className="btn" onClick={dismissDisconnect}>
            Dispensar
          </button>
        </div>
      </div>
    </div>
  );
}
