/**
 * Supabase queries for sessions, shared by history list, history detail
 * and post-ride summary.
 */

import { createClient } from './supabase/client';
import { Session } from '@/types';

/**
 * All sessions for an athlete, route joined, ordered most-recent first.
 * Used by history list and as the comparison universe for hero/PR detection.
 */
export async function loadAthleteSessions(athleteId: string): Promise<Session[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sessions')
    .select('*, routes (id, name, location, distance_km, elevation_m)')
    .eq('athlete_id', athleteId)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('Erro ao carregar sessions:', error.message);
    return [];
  }
  return (data ?? []) as Session[];
}

/**
 * Single session by id (route joined). Returns null if not found.
 */
export async function loadSession(id: string): Promise<Session | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sessions')
    .select('*, routes (id, name, location, distance_km, elevation_m, gpx_data)')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as Session;
}

export interface SessionLapRow {
  lap_number:     number;
  type:           'auto' | 'manual';
  started_at_s:   number;
  duration_s:     number;
  distance_km:    number;
  avg_power:      number;
  avg_hr:         number;
  avg_cadence:    number;
  avg_speed:      number | null;
  elevation_gain: number;
}

/**
 * Closed laps for a session (auto + manual), ordered by lap_number.
 * Returns [] if none persisted — callers should synthesize a single lap
 * covering the whole session in that case.
 */
export async function loadSessionLaps(sessionId: string): Promise<SessionLapRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('session_laps')
    .select('lap_number, type, started_at_s, duration_s, distance_km, avg_power, avg_hr, avg_cadence, avg_speed, elevation_gain')
    .eq('session_id', sessionId)
    .order('lap_number', { ascending: true });

  if (error) {
    console.error('Erro ao carregar laps:', error.message);
    return [];
  }
  return (data ?? []) as SessionLapRow[];
}
