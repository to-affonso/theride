'use client';

/**
 * Post-ride summary page.
 *
 * Reads the just-completed session from the BLE store, computes
 * aggregates via `computeSessionAggregates`, persists to Supabase, and
 * renders the shared `<SessionDetail>` with comparison context loaded
 * from the athlete's prior sessions.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBleStore } from '@/stores/bleStore';
import { useRouteStore } from '@/stores/routeStore';
import { useAthleteStore } from '@/stores/athleteStore';
import { createClient } from '@/lib/supabase/client';
import { Session } from '@/types';
import { computeSessionAggregates } from '@/lib/metrics';
import { loadAthleteSessions } from '@/lib/sessions';
import {
  findLastAttempt,
  aggregateHistoricalBest,
} from '@/lib/comparison';
import { SessionDetail } from '@/components/session/SessionDetail';
import { downloadSessionAsFit, lapsFromInMemory } from '@/lib/fit/download';

const TEMP_SESSION_ID = 'in-flight';

export default function SummaryPage() {
  const router  = useRouter();
  const saved   = useRef(false);

  const distanceKm           = useBleStore(s => s.distanceKm);
  const elapsed              = useBleStore(s => s.elapsed);
  const ftp                  = useBleStore(s => s.ftp);
  const sessionPowerSeries   = useBleStore(s => s.sessionPowerSeries);
  const sessionHrSeries      = useBleStore(s => s.sessionHrSeries);
  const sessionCadenceSeries = useBleStore(s => s.sessionCadenceSeries);
  const sessionSpeedSeries   = useBleStore(s => s.sessionSpeedSeries);
  const devices              = useBleStore(s => s.devices);
  const inMemoryLaps         = useBleStore(s => s.laps);
  const resetSession         = useBleStore(s => s.resetSession);
  const route   = useRouteStore(s => s.selectedRoute);
  const athlete = useAthleteStore(s => s.athlete);

  const [priorSessions, setPriorSessions] = useState<Session[] | null>(null);

  // ── Compute aggregates in-memory ──────────────────────────────────────
  const aggregates = useMemo(() => computeSessionAggregates({
    powerSeries:     sessionPowerSeries,
    hrSeries:        sessionHrSeries,
    cadenceSeries:   sessionCadenceSeries,
    durationSeconds: elapsed,
    ftp,
    maxHr:           athlete?.max_hr ?? 190,
    hrZoneBounds:    athlete?.hr_zones,
  }), [sessionPowerSeries, sessionHrSeries, sessionCadenceSeries, elapsed, ftp, athlete?.max_hr, athlete?.hr_zones]);

  // ── Build an in-memory Session that mirrors what gets saved ───────────
  const startedAtIso = useMemo(
    () => new Date(Date.now() - elapsed * 1000).toISOString(),
    // Stabilize the timestamp on mount — recomputing every render would
    // break comparison memoization downstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const inMemorySession: Session = useMemo(() => ({
    id: TEMP_SESSION_ID,
    athlete_id:        athlete?.id ?? '',
    route_id:          route?.id ?? null,
    started_at:        startedAtIso,
    duration_s:        elapsed,
    avg_power:         aggregates.avgPower,
    avg_hr:            aggregates.avgHr,
    calories:          aggregates.calories,
    distance_km:       distanceKm,
    tss:               aggregates.tss,
    power_series:      sessionPowerSeries.slice(-3600),
    hr_series:         sessionHrSeries.slice(-3600),
    cadence_series:    sessionCadenceSeries.slice(-3600),
    speed_series:      sessionSpeedSeries.slice(-3600),
    normalized_power:  aggregates.normalizedPower,
    intensity_factor:  aggregates.intensityFactor,
    variability_index: aggregates.variabilityIndex,
    max_power:         aggregates.maxPower,
    max_hr:            aggregates.maxHr,
    avg_cadence:       aggregates.avgCadence,
    kj:                aggregates.kj,
    best_power:        aggregates.bestPower,
    power_zone_seconds: aggregates.powerZoneSeconds,
    hr_zone_seconds:   aggregates.hrZoneSeconds,
    ftp_at_time:       ftp,
    devices: {
      trainer: devices.trainer.name || null,
      cadence: devices.cadence.name || null,
      speed:   devices.speed.name   || null,
      hr:      devices.hr.name      || null,
    },
    created_at: startedAtIso,
    routes: route
      ? { id: route.id, name: route.name, location: route.location, distance_km: route.distance_km, elevation_m: route.elevation_m, gpx_data: route.gpx_data ?? null }
      : null,
  }), [
    athlete?.id, route, startedAtIso, elapsed, aggregates, distanceKm, ftp, devices,
    sessionPowerSeries, sessionHrSeries, sessionCadenceSeries, sessionSpeedSeries,
  ]);

  // ── Load prior sessions for comparison context ────────────────────────
  useEffect(() => {
    if (!athlete) return;
    loadAthleteSessions(athlete.id).then(all => {
      // Keep only sessions started strictly BEFORE this one (excludes the
      // in-flight save that may land while we're rendering).
      const cutoff = new Date(startedAtIso).getTime();
      setPriorSessions(all.filter(s => new Date(s.started_at).getTime() < cutoff));
    });
  }, [athlete, startedAtIso]);

  const lastAttempt = useMemo(
    () => priorSessions ? findLastAttempt(priorSessions, TEMP_SESSION_ID, route?.id ?? null) : null,
    [priorSessions, route?.id],
  );
  const historicalBest = useMemo(
    () => priorSessions ? aggregateHistoricalBest(priorSessions) : {},
    [priorSessions],
  );

  // ── Auto-save once ────────────────────────────────────────────────────
  useEffect(() => {
    if (saved.current || !athlete || elapsed < 5) return;
    saved.current = true;

    const supabase = createClient();
    supabase.from('sessions').insert({
      athlete_id:        athlete.id,
      route_id:          route?.id ?? null,
      started_at:        startedAtIso,
      duration_s:        elapsed,
      avg_power:         aggregates.avgPower,
      avg_hr:            aggregates.avgHr,
      calories:          aggregates.calories,
      distance_km:       parseFloat(distanceKm.toFixed(2)),
      tss:               aggregates.tss,
      power_series:      sessionPowerSeries.slice(-3600),
      hr_series:         sessionHrSeries.slice(-3600),
      cadence_series:    sessionCadenceSeries.slice(-3600),
      speed_series:      sessionSpeedSeries.slice(-3600),
      normalized_power:  aggregates.normalizedPower,
      intensity_factor:  aggregates.intensityFactor,
      variability_index: aggregates.variabilityIndex,
      max_power:         aggregates.maxPower,
      max_hr:            aggregates.maxHr,
      avg_cadence:       aggregates.avgCadence,
      kj:                aggregates.kj,
      best_power:         aggregates.bestPower,
      power_zone_seconds: aggregates.powerZoneSeconds,
      hr_zone_seconds:    aggregates.hrZoneSeconds,
      ftp_at_time:        ftp,
      devices: {
        trainer: devices.trainer.name || null,
        cadence: devices.cadence.name || null,
        hr:      devices.hr.name      || null,
      },
    }).then(({ error }) => {
      if (error) console.error('Erro ao salvar sessão:', error.message);
    });
  }, [
    athlete, elapsed, aggregates, distanceKm, ftp, route, startedAtIso, devices,
    sessionPowerSeries, sessionHrSeries, sessionCadenceSeries, sessionSpeedSeries,
  ]);

  function handleHome() {
    resetSession();
    router.push('/route');
  }

  function handleExportFit() {
    try {
      downloadSessionAsFit({
        session: inMemorySession,
        laps:    lapsFromInMemory(inMemoryLaps, startedAtIso),
      });
    } catch (err) {
      console.error('Falha ao exportar .FIT:', err);
      alert('Não foi possível gerar o arquivo .FIT. Veja o console para detalhes.');
    }
  }

  const canExport = elapsed >= 5 && sessionPowerSeries.length > 0;

  return (
    <SessionDetail
      session={inMemorySession}
      athlete={athlete}
      lastAttempt={lastAttempt}
      historicalBest={historicalBest}
      mode="post-ride"
      headerActions={
        <>
          <button className="btn" onClick={handleExportFit} disabled={!canExport}>Exportar .FIT</button>
          <button className="btn primary" onClick={handleHome}>Voltar para início</button>
        </>
      }
    />
  );
}
