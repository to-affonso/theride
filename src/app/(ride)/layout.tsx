'use client';

import { usePathname } from 'next/navigation';
import { TopBar } from '@/components/TopBar';

export default function RideLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isLive    = pathname === '/live';
  const isSummary = pathname === '/summary' || pathname.startsWith('/summary/');

  if (isLive) {
    return (
      <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
        {children}
      </div>
    );
  }

  if (isSummary) {
    return <div className="stage">{children}</div>;
  }

  return (
    <div className="stage">
      <TopBar />
      {children}
    </div>
  );
}
