export interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;    // metres
  distKm: number; // cumulative distance from start
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function smoothElevation(points: { ele: number }[], window = 5): number[] {
  const half = Math.floor(window / 2);
  return points.map((_, i) => {
    const from = Math.max(0, i - half);
    const to   = Math.min(points.length - 1, i + half);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += points[j].ele;
    return sum / (to - from + 1);
  });
}

export function parseGpx(xml: string): GpxPoint[] {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xml, 'application/xml');
  const trkpts = Array.from(doc.querySelectorAll('trkpt'));

  if (trkpts.length === 0) throw new Error('Nenhum trackpoint encontrado no arquivo GPX.');

  const raw = trkpts.map(pt => ({
    lat: parseFloat(pt.getAttribute('lat') ?? '0'),
    lon: parseFloat(pt.getAttribute('lon') ?? '0'),
    ele: parseFloat(pt.querySelector('ele')?.textContent ?? '0'),
  }));

  const smoothedEle = smoothElevation(raw, 5);

  const points: GpxPoint[] = [];
  let cumDist = 0;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) {
      cumDist += haversineKm(raw[i - 1].lat, raw[i - 1].lon, raw[i].lat, raw[i].lon);
    }
    points.push({ lat: raw[i].lat, lon: raw[i].lon, ele: smoothedEle[i], distKm: cumDist });
  }
  return points;
}

function findIndex(points: GpxPoint[], distKm: number): number {
  let lo = 0, hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].distKm <= distKm) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function positionAt(points: GpxPoint[], distKm: number): { lat: number; lon: number; ele: number } {
  if (points.length === 0) return { lat: 0, lon: 0, ele: 0 };
  const d = Math.max(0, Math.min(distKm, points[points.length - 1].distKm));
  const i = findIndex(points, d);
  const a = points[i];
  const b = points[Math.min(i + 1, points.length - 1)];
  if (a === b || b.distKm === a.distKm) return { lat: a.lat, lon: a.lon, ele: a.ele };
  const t = (d - a.distKm) / (b.distKm - a.distKm);
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    ele: a.ele + (b.ele - a.ele) * t,
  };
}

export function gradeAt(points: GpxPoint[], distKm: number): number {
  if (points.length < 2) return 0;
  const WINDOW_KM = 0.1; // 100m smoothing window for grade
  const d0 = Math.max(0, distKm - WINDOW_KM / 2);
  const d1 = Math.min(points[points.length - 1].distKm, distKm + WINDOW_KM / 2);
  const p0 = positionAt(points, d0);
  const p1 = positionAt(points, d1);
  const dDist = d1 - d0;
  if (dDist < 0.001) return 0;
  const grade = ((p1.ele - p0.ele) / (dDist * 1000)) * 100;
  return Math.max(-25, Math.min(25, grade));
}

export function totalElevationGain(points: GpxPoint[]): number {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].ele - points[i - 1].ele;
    if (d > 0) gain += d;
  }
  return Math.round(gain);
}
