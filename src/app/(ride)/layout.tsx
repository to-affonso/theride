'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useBleStore } from '@/stores/bleStore';
import { useAthleteStore } from '@/stores/athleteStore';
import { useAntStore } from '@/stores/antStore';

import { createClient } from '@/lib/supabase/client';
import { Icons } from '@/components/icons';
import { DeviceModal } from '@/components/DeviceModal';

const ACCENT = '#D5FF00';

// Small inline icons — kept here rather than in icons/index to scope-limit the change.
const IconHistory = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-7.5 4"/>
    <path d="M3 4v4h4"/>
    <path d="M12 7v5l3 2"/>
  </svg>
);
const IconRide = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="17" r="4"/>
    <circle cx="18" cy="17" r="4"/>
    <path d="M6 17l4-9h6l-4 9"/>
    <path d="M14 8h3"/>
  </svg>
);
const IconLogout = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/>
    <path d="M16 17l5-5-5-5"/>
    <path d="M21 12H9"/>
  </svg>
);

export default function RideLayout({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const athlete    = useAthleteStore(s => s.athlete);
  const setAthlete = useAthleteStore(s => s.setAthlete);
  const devices      = useBleStore(s => s.devices);
  const antConnected = useAntStore(s => s.connected);
  const connectedCount = Object.values(devices).filter(d => d.connected).length + (antConnected ? 1 : 0);

  const [devModalOpen, setDevModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('athletes').select('*').eq('user_id', user.id).single();
      if (data) setAthlete(data);
    });
  }, [setAthlete]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onClickAway(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  }

  function navigateAndClose(path: string) {
    setMenuOpen(false);
    router.push(path);
  }

  const isLive = pathname === '/live';

  if (isLive) {
    return (
      <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
        {children}
      </div>
    );
  }

  return (
    <div className="stage">
      <header className="chrome">
        <div className="chrome-left">
          <div className="brand">
            <div className="brand-mark">
              <Icons.Symbol />
            </div>
            <span className="brand-name">The <em>Ride</em></span>
          </div>
        </div>

        <div className="chrome-right">
          <button
            className={`chip ${connectedCount > 0 ? 'on' : ''}`}
            onClick={() => setDevModalOpen(o => !o)}
            style={devModalOpen ? { borderColor: ACCENT, color: ACCENT } : undefined}
          >
            <Icons.Bluetooth size={14}/>
            <span>{connectedCount}/4</span>
            <span className="chip-sub">BLE</span>
          </button>

          {athlete && (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                className="chip avatar-chip"
                onClick={() => setMenuOpen(o => !o)}
                title="Menu"
                style={menuOpen ? { borderColor: ACCENT } : undefined}
              >
                <div className="avatar">
                  {athlete.name.slice(0, 2).toUpperCase()}
                </div>
              </button>

              {menuOpen && (
                <div className="pop-anchor" style={{ right: 0, width: 240 }}>
                  <div className="popover" style={{ width: 240 }}>
                    <div className="pop-head">
                      <div>
                        <div className="pop-title">{athlete.name || 'Atleta'}</div>
                        <div className="pop-sub">FTP {athlete.ftp}W · {athlete.weight}kg</div>
                      </div>
                    </div>
                    <div className="pop-body">
                      <button className="menu-link" onClick={() => navigateAndClose('/route')}>
                        <IconRide/> Pedalar agora
                      </button>
                      <button className="menu-link" onClick={() => navigateAndClose('/history')}>
                        <IconHistory/> Histórico
                      </button>
                      <div className="menu-divider"/>
                      <button className="menu-link danger" onClick={handleLogout}>
                        <IconLogout/> Sair
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {children}

      {devModalOpen && <DeviceModal onClose={() => setDevModalOpen(false)}/>}
    </div>
  );
}
