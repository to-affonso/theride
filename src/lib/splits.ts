/**
 * Per-km splits.
 *
 * Walks 1Hz session series and partitions samples by cumulative distance
 * boundaries (1km, 2km, ...). For each split, returns averages of power,
 * HR, cadence, speed plus the time spent crossing that km.
 *
 * Distance is derived from `speed_series` (km/h at 1Hz, integrated). If
 * absent, falls back to linear progress against `totalDistanceKm` — useful
 * for indoor trainer rides where speed wasn't recorded.
 */

export interface KmSplit {
  index:      number;   // 0-based — split 1 → index 0
  distanceKm: number;   // upper bound of this split (typically index+1)
  durationS:  number;
  avgPower:   number;
  avgHr:      number;
  avgCadence: number;
  avgSpeed:   number;   // km/h
}

export interface KmSplitsInput {
  powerSeries:   number[];
  hrSeries:      number[];
  cadenceSeries?: number[];
  speedSeries?:  number[];
  totalDistanceKm: number;
  durationS: number;
}

export function computeKmSplits(input: KmSplitsInput): KmSplit[] {
  const { powerSeries, hrSeries, cadenceSeries, speedSeries, totalDistanceKm, durationS } = input;
  const n = Math.max(powerSeries.length, hrSeries.length);
  if (n < 2 || totalDistanceKm <= 0) return [];

  // Per-sample cumulative distance (km).
  const dists = new Array<number>(n);
  if (speedSeries && speedSeries.length === n) {
    let cum = 0;
    for (let i = 0; i < n; i++) {
      cum += Math.max(0, speedSeries[i]) / 3600;
      dists[i] = cum;
    }
    // Scale to match totalDistanceKm exactly (sensors can drift).
    const last = dists[n - 1] || 1;
    const scale = totalDistanceKm / last;
    for (let i = 0; i < n; i++) dists[i] *= scale;
  } else {
    for (let i = 0; i < n; i++) dists[i] = (i / (n - 1)) * totalDistanceKm;
  }

  // Approximate seconds per sample (some series aren't strictly 1Hz).
  const secPerSample = durationS > 0 ? durationS / n : 1;

  const splits: KmSplit[] = [];
  let lastIdx = 0;
  const fullKms = Math.floor(totalDistanceKm);

  for (let km = 1; km <= fullKms; km++) {
    let endIdx = lastIdx;
    while (endIdx < n && dists[endIdx] < km) endIdx++;
    if (endIdx <= lastIdx) continue;

    splits.push(buildSplit(
      km - 1,
      km,
      lastIdx,
      Math.min(endIdx, n - 1),
      powerSeries, hrSeries, cadenceSeries,
      secPerSample,
    ));
    lastIdx = endIdx;
  }

  // Trailing partial km (e.g. 26.19 → final split covering 26→26.19).
  if (lastIdx < n - 1 && totalDistanceKm - fullKms > 0.1) {
    splits.push(buildSplit(
      fullKms,
      totalDistanceKm,
      lastIdx,
      n - 1,
      powerSeries, hrSeries, cadenceSeries,
      secPerSample,
    ));
  }

  return splits;
}

function buildSplit(
  index: number,
  endKm: number,
  startIdx: number,
  endIdx: number,
  power: number[],
  hr: number[],
  cadence: number[] | undefined,
  secPerSample: number,
): KmSplit {
  const count = Math.max(1, endIdx - startIdx);
  const durationS = count * secPerSample;

  const avgPower   = meanRange(power,   startIdx, endIdx, false);
  const avgHr      = meanRange(hr,      startIdx, endIdx, false);
  const avgCadence = cadence ? meanRange(cadence, startIdx, endIdx, true) : 0;

  // Avg speed from the actual distance covered and duration.
  const distSpan = index > 0 ? endKm - index : endKm;
  const avgSpeed = durationS > 0 ? distSpan / (durationS / 3600) : 0;

  return {
    index,
    distanceKm: endKm,
    durationS:  Math.round(durationS),
    avgPower:   Math.round(avgPower),
    avgHr:      Math.round(avgHr),
    avgCadence: Math.round(avgCadence),
    avgSpeed:   Math.round(avgSpeed * 10) / 10,
  };
}

function meanRange(arr: number[], from: number, to: number, excludeZeros: boolean): number {
  let sum = 0, n = 0;
  const end = Math.min(arr.length - 1, to);
  for (let i = from; i <= end; i++) {
    const v = arr[i];
    if (excludeZeros && v <= 0) continue;
    sum += v; n++;
  }
  return n > 0 ? sum / n : 0;
}
