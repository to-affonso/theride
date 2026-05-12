'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GpxPoint, positionAt } from '@/lib/gpx';

const ACCENT      = '#D5FF00';
const TRACK_COLOR = 'rgba(255,255,255,0.15)';
const DONE_COLOR  = ACCENT;

// ── Rider marker ─────────────────────────────────────────────────────────────
const riderIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      width:22px; height:22px; border-radius:50%;
      background:${ACCENT}; border:3px solid #0A0A0A;
      box-shadow:0 0 0 6px ${ACCENT}33, 0 0 18px ${ACCENT}66;
      position:relative;
    "></div>`,
  iconSize:   [22, 22],
  iconAnchor: [11, 11],
});

// ── Auto-pan to rider position ────────────────────────────────────────────────
function Tracker({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.panTo([lat, lon], { animate: true, duration: 0.8 });
  }, [lat, lon, map]);
  return null;
}

// ── Main inner component (runs only client-side) ──────────────────────────────
export default function LiveMapInner({
  points,
  distanceKm,
  currentGrade,
}: {
  points: GpxPoint[];
  distanceKm: number;
  currentGrade?: number;
}) {
  const markerRef = useRef<L.Marker | null>(null);

  const pos = positionAt(points, distanceKm);
  const center: [number, number] = [pos.lat, pos.lon];

  // Split route into completed / remaining segments
  const totalDist = points[points.length - 1]?.distKm ?? 0;
  const splitIdx  = points.findIndex(p => p.distKm >= distanceKm);
  const split     = splitIdx < 0 ? points.length - 1 : splitIdx;

  const donePath      = points.slice(0, split + 1).map(p => [p.lat, p.lon] as [number, number]);
  const remainingPath = points.slice(split).map(p => [p.lat, p.lon] as [number, number]);
  const fullPath      = points.map(p => [p.lat, p.lon] as [number, number]);

  // Update marker position without re-mounting
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng([pos.lat, pos.lon]);
    }
  }, [pos.lat, pos.lon]);

  // Update the gradient tooltip content whenever the grade changes.
  useEffect(() => {
    const m = markerRef.current;
    if (!m || currentGrade == null) return;
    const tooltip = m.getTooltip();
    if (tooltip) {
      const color = currentGrade > 0 ? '#FF9F43' : currentGrade < -1 ? '#4ade80' : '#FAFAFA';
      const sign  = currentGrade >= 0 ? '+' : '';
      tooltip.setContent(
        `<span style="color:${color};font-family:'JetBrains Mono';font-size:11px;font-weight:600;">${sign}${currentGrade.toFixed(1)}%</span>`,
      );
    }
  }, [currentGrade]);

  if (points.length === 0) return null;

  return (
    <MapContainer
      center={center}
      zoom={15}
      zoomControl={false}
      attributionControl={false}
      style={{ width: '100%', height: '100%', background: '#0A0A0A' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={19}
      />

      {/* Full route ghost */}
      <Polyline positions={fullPath} pathOptions={{ color: TRACK_COLOR, weight: 10, lineCap: 'round', lineJoin: 'round' }} />

      {/* Remaining */}
      <Polyline positions={remainingPath} pathOptions={{ color: 'rgba(255,255,255,0.25)', weight: 3, dashArray: '4 8', lineCap: 'round' }} />

      {/* Completed */}
      {donePath.length > 1 && (
        <Polyline positions={donePath} pathOptions={{ color: DONE_COLOR, weight: 4, lineCap: 'round', lineJoin: 'round' }} />
      )}

      {/* Start marker */}
      <StartFinishMarkers points={points} totalDist={totalDist} distanceKm={distanceKm} />

      {/* Rider */}
      <RiderMarker lat={pos.lat} lon={pos.lon} markerRef={markerRef} />

      {/* Camera tracker */}
      <Tracker lat={pos.lat} lon={pos.lon} />
    </MapContainer>
  );
}

function StartFinishMarkers({
  points,
  totalDist,
  distanceKm,
}: {
  points: GpxPoint[];
  totalDist: number;
  distanceKm: number;
}) {
  const startIcon = L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;border-radius:50%;background:#4ade80;border:2px solid #0A0A0A;"></div>`,
    iconSize: [10, 10], iconAnchor: [5, 5],
  });
  const finishIcon = L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;border-radius:50%;background:${ACCENT};border:2px solid #0A0A0A;"></div>`,
    iconSize: [10, 10], iconAnchor: [5, 5],
  });

  const start  = points[0];
  const finish = points[points.length - 1];

  useEffect(() => {
    if (!start || !finish) return;
    // markers are rendered via react-leaflet Marker below
  }, [start, finish]);

  if (!start || !finish) return null;

  return (
    <>
      {distanceKm < 0.05 && (
        <MarkerWithIcon position={[start.lat, start.lon]} icon={startIcon} />
      )}
      {distanceKm >= totalDist - 0.3 && (
        <MarkerWithIcon position={[finish.lat, finish.lon]} icon={finishIcon} />
      )}
    </>
  );
}

function MarkerWithIcon({ position, icon }: { position: [number, number]; icon: L.DivIcon }) {
  const map = useMap();
  useEffect(() => {
    const m = L.marker(position, { icon }).addTo(map);
    return () => { m.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

function RiderMarker({
  lat, lon, markerRef,
}: {
  lat: number;
  lon: number;
  markerRef: React.MutableRefObject<L.Marker | null>;
}) {
  const map = useMap();
  useEffect(() => {
    const m = L.marker([lat, lon], { icon: riderIcon, zIndexOffset: 1000 }).addTo(map);
    // Permanent tooltip holds the live gradient (content updated externally).
    m.bindTooltip('', {
      permanent:  true,
      direction:  'right',
      offset:     [12, 0],
      opacity:    1,
      className:  'gradient-tooltip',
    });
    markerRef.current = m;
    return () => { m.remove(); markerRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}
