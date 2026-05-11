'use client';

import { useBleStore } from '@/stores/bleStore';
import { useAntStore } from '@/stores/antStore';
import { Icons } from '@/components/icons';
import { DeviceType } from '@/types';

const ACCENT = '#D5FF00';

const MODAL_DEVICES = [
  { id: 'trainer' as DeviceType, label: 'Smart Trainer',      Icon: Icons.Trainer },
  { id: 'cadence' as DeviceType, label: 'Sensor de Cadência', Icon: Icons.Cadence },
  { id: 'hr'      as DeviceType, label: 'Monitor Cardíaco',   Icon: Icons.Heart },
];

function actionBtn(connected: boolean, busy: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 4,
    border: connected ? '1px solid rgba(255,159,67,0.35)' : '1px solid var(--line-soft)',
    background: 'none',
    color: connected ? '#FF9F43' : 'var(--fg-2)',
    fontFamily: "'JetBrains Mono'",
    letterSpacing: '0.04em',
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.45 : 1,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  };
}

export function DeviceModal({ onClose }: { onClose: () => void }) {
  const connect     = useBleStore(s => s.connect);
  const disconnect  = useBleStore(s => s.disconnect);
  const devices     = useBleStore(s => s.devices);
  const isSupported = useBleStore(s => s.isSupported);

  const antConnect    = useAntStore(s => s.connect);
  const antDisconnect = useAntStore(s => s.disconnect);
  const antConnected  = useAntStore(s => s.connected);
  const antConnecting = useAntStore(s => s.connecting);
  const antSupported  = useAntStore(s => s.isSupported);
  const antDongle     = useAntStore(s => s.dongleName);

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1100 }} onClick={onClose}/>

      {/* Panel — above chrome (1050) so backdrop covers it correctly */}
      <div
        style={{
          position: 'fixed', top: 58, right: 16, zIndex: 1101,
          width: 316, background: 'var(--bg-2)',
          border: '1px solid var(--line-soft)', borderRadius: 12,
          boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px 10px' }}>
          <span style={{
            fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--fg-3)',
          }}>
            Dispositivos
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', display: 'flex', padding: 2, lineHeight: 0 }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {!isSupported && (
          <div style={{
            margin: '0 12px 8px', padding: '8px 10px', borderRadius: 6,
            background: 'rgba(255,90,31,0.07)', border: '1px solid rgba(255,90,31,0.18)',
            fontSize: 10.5, color: 'var(--warn)', lineHeight: 1.4,
          }}>
            Web Bluetooth indisponível. Use Chrome ou Edge.
          </div>
        )}

        {/* BLE device rows */}
        {MODAL_DEVICES.map(({ id, label, Icon }) => {
          const d = devices[id];
          return (
            <div
              key={id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', borderTop: '1px solid var(--line-soft)',
                position: 'relative',
              }}
            >
              <Icon size={16} c={d.connected ? ACCENT : 'var(--fg-3)'}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.connected ? d.name : label}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                  <span className={`dot ${d.connected ? '' : d.connecting ? 'warn' : 'off'}`} style={{ width: 5, height: 5 }}/>
                  {d.connected ? 'Conectado' : d.connecting ? 'Procurando...' : 'Desconectado'}
                </div>
              </div>
              <button
                style={actionBtn(d.connected, !isSupported || d.connecting)}
                onClick={() => isSupported && (d.connected ? disconnect(id) : !d.connecting && connect(id))}
              >
                {d.connected ? 'Desconectar' : d.connecting ? '···' : 'Conectar'}
              </button>
              {d.connecting && <div className="scanning-bar"/>}
            </div>
          );
        })}

        {/* ANT+ row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderTop: '1px solid var(--line-soft)',
          position: 'relative',
        }}>
          <Icons.Bluetooth size={16} c={antConnected ? ACCENT : 'var(--fg-3)'}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {antConnected ? antDongle : 'Dongle ANT+'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
              <span className={`dot ${antConnected ? '' : antConnecting ? 'warn' : 'off'}`} style={{ width: 5, height: 5 }}/>
              {antConnected ? 'Conectado' : antConnecting ? 'Procurando...' : antSupported ? 'ANT+ · USB' : 'Serial indisponível'}
            </div>
          </div>
          <button
            style={actionBtn(antConnected, !antSupported || antConnecting)}
            onClick={() => antSupported && (antConnected ? antDisconnect() : !antConnecting && antConnect())}
          >
            {antConnected ? 'Desconectar' : antConnecting ? '···' : 'Conectar'}
          </button>
          {antConnecting && <div className="scanning-bar"/>}
        </div>
      </div>
    </>
  );
}
