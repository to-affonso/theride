'use client';

import dynamic from 'next/dynamic';
import { GpxPoint } from '@/lib/gpx';

export interface LiveMapProps {
  points: GpxPoint[];
  distanceKm: number;
}

// Leaflet uses window — must be loaded client-side only
const LiveMapInner = dynamic(() => import('./LiveMapInner'), { ssr: false, loading: () => <MapFallback /> });

function MapFallback() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em' }}>
        Carregando mapa…
      </span>
    </div>
  );
}

export default function LiveMap(props: LiveMapProps) {
  return <LiveMapInner {...props} />;
}
