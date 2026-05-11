'use client';

/**
 * History session detail.
 *
 * Loads the session + the athlete's full history from Supabase, then
 * delegates rendering to the shared `<SessionDetail>` with mode='history'.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAthleteStore } from '@/stores/athleteStore';
import { Session } from '@/types';
import { loadSession, loadAthleteSessions } from '@/lib/sessions';
import { findLastAttempt, aggregateHistoricalBest } from '@/lib/comparison';
import { SessionDetail } from '@/components/session/SessionDetail';

export default function HistoryDetailPage() {
  const router  = useRouter();
  const params  = useParams<{ id: string }>();
  const athlete = useAthleteStore(s => s.athlete);

  const [session, setSession] = useState<Session | null | 'not-found'>(null);
  const [allSessions, setAllSessions] = useState<Session[]>([]);

  // Load the session
  useEffect(() => {
    if (!params?.id) return;
    loadSession(params.id).then(s => setSession(s ?? 'not-found'));
  }, [params?.id]);

  // Load the athlete's full history (for comparison context)
  useEffect(() => {
    if (!athlete) return;
    loadAthleteSessions(athlete.id).then(setAllSessions);
  }, [athlete]);

  const lastAttempt = useMemo(() => {
    if (!session || session === 'not-found') return null;
    return findLastAttempt(allSessions, session.id, session.route_id);
  }, [allSessions, session]);

  const historicalBest = useMemo(() => {
    if (!session || session === 'not-found') return {};
    return aggregateHistoricalBest(allSessions, session.id);
  }, [allSessions, session]);

  if (session === null) {
    return (
      <div className="screen">
        <div className="summary">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--fg-3)', fontFamily: "'JetBrains Mono'", fontSize: 13 }}>
            Carregando treino…
          </div>
        </div>
      </div>
    );
  }

  if (session === 'not-found') {
    return (
      <div className="screen">
        <div className="summary">
          <div className="history-empty" style={{ marginTop: 80 }}>
            <h2>Treino não encontrado.</h2>
            <p>O treino que você procurou não existe ou foi removido.</p>
            <button className="btn primary" onClick={() => router.push('/history')}>
              Voltar ao histórico
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SessionDetail
      session={session}
      athlete={athlete}
      lastAttempt={lastAttempt}
      historicalBest={historicalBest}
      mode="history"
      headerActions={
        <button className="btn" onClick={() => router.push('/history')}>
          ← Histórico
        </button>
      }
    />
  );
}
