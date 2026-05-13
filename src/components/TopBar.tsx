'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useBleStore } from '@/stores/bleStore';
import { useAthleteStore } from '@/stores/athleteStore';
import { useAntStore } from '@/stores/antStore';

import { createClient } from '@/lib/supabase/client';
import { Icons } from '@/components/icons';
import { DeviceModal } from '@/components/DeviceModal';
import Image from 'next/image';

const ACCENT = '#D5FF00';

const IconLogout = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/>
    <path d="M16 17l5-5-5-5"/>
    <path d="M21 12H9"/>
  </svg>
);

type NavItem = { label: string; href?: string; match: (pathname: string) => boolean };

const NAV_ITEMS: NavItem[] = [
  { label: 'Início',        href: undefined,  match: () => false },
  { label: 'Rotas',         href: '/route',   match: p => p === '/route' || p.startsWith('/route/') },
  { label: 'Histórico',     href: '/history', match: p => p === '/history' || p.startsWith('/history/') },
  { label: 'Configurações', href: '/pair',    match: p => p === '/pair' },
];

export function TopBar() {
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

  return (
    <>
      <header className="chrome">
        <div className="chrome-left">
          <Link href="/route" className="brand" aria-label="The Ride">
            <Image
              src="/images/theRideLogo.svg"
              alt="The Ride"
              width={46}
              height={32}
              priority
            />
          </Link>
        </div>

        <nav className="chrome-nav" aria-label="Navegação principal">
          {NAV_ITEMS.map(item => {
            const active = item.href ? item.match(pathname) : false;
            const disabled = !item.href;
            if (disabled) {
              return (
                <span key={item.label} className="nav-item disabled" aria-disabled="true">
                  {item.label}
                </span>
              );
            }
            return (
              <Link
                key={item.label}
                href={item.href!}
                className="nav-item"
                data-active={active || undefined}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

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

      {devModalOpen && <DeviceModal onClose={() => setDevModalOpen(false)}/>}
    </>
  );
}
