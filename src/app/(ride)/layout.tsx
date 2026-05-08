'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useBleStore } from '@/stores/bleStore';
import { useAthleteStore } from '@/stores/athleteStore';
import { useAntStore } from '@/stores/antStore';

import { createClient } from '@/lib/supabase/client';
import { Icons } from '@/components/icons';
import { DeviceModal } from '@/components/DeviceModal';

const ACCENT = '#D5FF00';

export default function RideLayout({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const athlete    = useAthleteStore(s => s.athlete);
  const setAthlete = useAthleteStore(s => s.setAthlete);
  const devices      = useBleStore(s => s.devices);
  const antConnected = useAntStore(s => s.connected);
  const connectedCount = Object.values(devices).filter(d => d.connected).length + (antConnected ? 1 : 0);

  const [devModalOpen, setDevModalOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('athletes').select('*').eq('user_id', user.id).single();
      if (data) setAthlete(data);
    });
  }, [setAthlete]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
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
            <button className="chip avatar-chip" onClick={handleLogout} title="Sair">
              <div className="avatar">
                {athlete.name.slice(0, 2).toUpperCase()}
              </div>
            </button>
          )}
        </div>
      </header>

      {children}

      {devModalOpen && <DeviceModal onClose={() => setDevModalOpen(false)}/>}
    </div>
  );
}
