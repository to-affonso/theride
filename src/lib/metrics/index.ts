/**
 * Performance metrics — single import surface.
 *
 *   import { trainingStressScore, normalizedPower, ... } from '@/lib/metrics';
 *
 * For the all-in-one aggregator used in summary save:
 *   import { computeSessionAggregates } from '@/lib/metrics';
 */

export { normalizedPower }    from './np';
export { intensityFactor }    from './intensityFactor';
export { trainingStressScore, classifyTss } from './tss';
export type { TssClassification } from './tss';
export { variabilityIndex }   from './variabilityIndex';
export { meanMaxPower, estimateFtpFromMmp, findPrs, MMP_WINDOWS_SECONDS } from './mmp';
export type { BestPower, MmpKey } from './mmp';
export { decoupling }         from './decoupling';
export {
  powerZoneDistribution,
  hrZoneDistribution,
  dominantPowerZone,
} from './zoneDistribution';
export type { PowerZoneSeconds, HrZoneSeconds } from './zoneDistribution';
export { kjWork, calories, caloriesIncrement } from './work';
export { computeSessionAggregates }    from './aggregates';
export type { SessionAggregates, SessionAggregatesInput } from './aggregates';
