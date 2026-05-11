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
    .select('*, routes (id, name, location, distance_km, elevation_m)')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as Session;
}
