/**
 * Compute all session aggregates in one pass.
 *
 * This is the canonical entry point called at the end of a ride (in summary page)
 * to compute everything needed for persistence + display + insights.
 *
 * Each individual metric also has its own exported function (see siblings) for
 * use in other contexts (e.g. recomputing one metric from imported Strava data).
 */

import { normalizedPower } from './np';
import { intensityFactor } from './intensityFactor';
import { trainingStressScore } from './tss';
import { variabilityIndex } from './variabilityIndex';
import { meanMaxPower, BestPower } from './mmp';
import { decoupling } from './decoupling';
import {
  powerZoneDistribution,
  hrZoneDistribution,
  PowerZoneSeconds,
  HrZoneSeconds,
} from './zoneDistribution';
import { kjWork, calories } from './work';

export interface SessionAggregatesInput {
  powerSeries:   number[];   // 1Hz watts
  hrSeries:      number[];   // 1Hz bpm
  cadenceSeries: number[];   // 1Hz rpm (optional content)
  durationSeconds: number;
  ftp: number;
  maxHr: number;
}

export interface SessionAggregates {
  // Power
  avgPower: number;
  normalizedPower: number;
  maxPower: number;
  intensityFactor: number;
  variabilityIndex: number;
  tss: number;
  kj: number;
  calories: number;

  // HR
  avgHr: number;
  maxHr: number;

  // Cadence
  avgCadence: number;

  // Aerobic quality
  decoupling: number;

  // Curve
  bestPower: BestPower;

  // Distributions
  powerZoneSeconds: PowerZoneSeconds;
  hrZoneSeconds:    HrZoneSeconds;
}

export function computeSessionAggregates(input: SessionAggregatesInput): SessionAggregates {
  const { powerSeries, hrSeries, cadenceSeries, durationSeconds, ftp, maxHr } = input;

  const avgPower    = meanRoundedExcludingZeros(powerSeries);
  const np          = normalizedPower(powerSeries);
  const maxPower    = maxOrZero(powerSeries);
  const iF          = intensityFactor(np, ftp);
  const vi          = variabilityIndex(np, avgPower);
  const tss         = trainingStressScore(durationSeconds, np, ftp);
  const kj          = kjWork(avgPower, durationSeconds);
  const kcal        = calories(avgPower, durationSeconds);

  const avgHr       = meanRoundedExcludingZeros(hrSeries);
  const maxHrValue  = maxOrZero(hrSeries);

  const avgCadence  = meanRoundedExcludingZeros(cadenceSeries);

  const dec         = decoupling(powerSeries, hrSeries);
  const bestPower   = meanMaxPower(powerSeries);
  const powerZones  = powerZoneDistribution(powerSeries, ftp);
  const hrZones     = hrZoneDistribution(hrSeries, maxHr);

  return {
    avgPower,
    normalizedPower: np,
    maxPower,
    intensityFactor: round3(iF),
    variabilityIndex: round3(vi),
    tss,
    kj,
    calories: kcal,

    avgHr,
    maxHr: maxHrValue,

    avgCadence,

    decoupling: round1(dec),
    bestPower,
    powerZoneSeconds: powerZones,
    hrZoneSeconds:    hrZones,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function maxOrZero(arr: number[]): number {
  if (arr.length === 0) return 0;
  let max = 0;
  for (const v of arr) if (v > max) max = v;
  return max;
}

/**
 * Mean excluding zero samples. For power and HR, zero usually means
 * "sensor reported nothing" rather than a true 0 effort — we exclude to
 * keep averages meaningful. Cadence zeros (coasting) are legitimate but
 * also typically excluded for "moving average".
 */
function meanRoundedExcludingZeros(arr: number[]): number {
  let sum = 0;
  let n   = 0;
  for (const v of arr) {
    if (v > 0) { sum += v; n++; }
  }
  return n > 0 ? Math.round(sum / n) : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
