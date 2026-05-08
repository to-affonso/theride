'use client';

import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GpxPoint } from '@/lib/gpx';

const ACCENT = '#D5FF00';

function FitBounds({ points }: { points: GpxPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
    map.fitBounds(bounds, { padding: [16, 16], animate: false });
  }, [map, points]);
  return null;
}

export default function GpxPreviewMap({ points }: { points: GpxPoint[] }) {
  if (points.length === 0) return null;

  const center: [number, number] = [points[0].lat, points[0].lon];
  const path = points.map(p => [p.lat, p.lon] as [number, number]);

  return (
    <MapContainer
      center={center}
      zoom={13}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
      dragging={false}
      style={{ width: '100%', height: '100%', background: '#0A0A0A', borderRadius: 8 }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; CARTO'
        maxZoom={19}
      />
      <Polyline
        positions={path}
        pathOptions={{ color: 'rgba(255,255,255,0.18)', weight: 8, lineCap: 'round', lineJoin: 'round' }}
      />
      <Polyline
        positions={path}
        pathOptions={{ color: ACCENT, weight: 2.5, lineCap: 'round', lineJoin: 'round' }}
      />
      <FitBounds points={points}/>
    </MapContainer>
  );
}
