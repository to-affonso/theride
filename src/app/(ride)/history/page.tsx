'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAthleteStore } from '@/stores/athleteStore';
import { Session } from '@/types';
import { Icons } from '@/components/icons';
import { WorkoutListItem } from '@/components/history/WorkoutListItem';
import {
  formatCompact,
  formatClock,
  formatDateLong,
  dayKey,
  periodStart,
  PERIOD_LABELS,
  PeriodKey,
} from '@/lib/format';
import { MMP_WINDOWS_SECONDS, type MmpKey, type BestPower } from '@/lib/metrics';

const MMP_KEYS_ORDER: MmpKey[] = ['5s', '30s', '1min', '5min', '20min', '60min'];

function mmpKey(sec: number): MmpKey {
  switch (sec) {
    case 5: return '5s';
    case 30: return '30s';
    case 60: return '1min';
    case 300: return '5min';
    case 1200: return '20min';
    default: return '60min';
  }
}

export default function HistoryPage() {
  const router  = useRouter();
  const athlete = useAthleteStore(s => s.athlete);
  const [sessions, setSessions] = useState<Session[] | null>(null); // null = loading
  const [period, setPeriod] = useState<PeriodKey>('30d');

  // Restore filter from localStorage
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('history.period') : null;
    if (saved && saved in PERIOD_LABELS) setPeriod(saved as PeriodKey);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('history.period', period);
  }, [period]);

  // Load all sessions for the athlete (route joined). Client-side filter for MVP.
  useEffect(() => {
    if (!athlete) return;
    const supabase = createClient();
    supabase
      .from('sessions')
      .select('*, routes (id, name, location, distance_km, elevation_m)')
      .eq('athlete_id', athlete.id)
      .order('started_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('Erro ao carregar histórico:', error.message);
          setSessions([]);
          return;
        }
        setSessions(data as Session[]);
      });
  }, [athlete]);

  // Filter by period
  const filtered = useMemo(() => {
    if (!sessions) return null;
    const start = periodStart(period);
    if (!start) return sessions;
    return sessions.filter(s => new Date(s.started_at) >= start);
  }, [sessions, period]);

  // Period summary
  const summary = useMemo(() => {
    if (!filtered) return null;
    let totalTss = 0, totalKm = 0, totalSec = 0, totalKj = 0;
    for (const s of filtered) {
      totalTss += s.tss;
      totalKm  += s.distance_km;
      totalSec += s.duration_s;
      totalKj  += s.kj ?? Math.round(s.avg_power * s.duration_s / 1000);
    }
    return { count: filtered.length, totalTss, totalKm, totalSec, totalKj };
  }, [filtered]);

  // PR detection: scan chronologically, find which session holds the max per MMP window
  const prMap = useMemo(() => {
    if (!filtered) return new Map<string, MmpKey[]>();
    // Sort oldest first
    const chrono = [...filtered].sort((a, b) =>
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );
    // Track current PR holder per window
    const holder: Record<MmpKey, { value: number; sessionId: string } | null> = {
      '5s': null, '30s': null, '1min': null, '5min': null, '20min': null, '60min': null,
    };
    for (const s of chrono) {
      const bp = (s.best_power ?? {}) as BestPower;
      for (const w of MMP_WINDOWS_SECONDS) {
        const k = mmpKey(w);
        const v = bp[k];
        if (v !== undefined && v > 0 && (holder[k] === null || v > holder[k]!.value)) {
          holder[k] = { value: v, sessionId: s.id };
        }
      }
    }
    const map = new Map<string, MmpKey[]>();
    for (const k of MMP_KEYS_ORDER) {
      const h = holder[k];
      if (!h) continue;
      const arr = map.get(h.sessionId) ?? [];
      arr.push(k);
      map.set(h.sessionId, arr);
    }
    return map;
  }, [filtered]);

  // Group by day for date dividers
  const groups = useMemo(() => {
    if (!filtered) return [];
    const byDay = new Map<string, Session[]>();
    for (const s of filtered) {
      const k = dayKey(s.started_at);
      const arr = byDay.get(k) ?? [];
      arr.push(s);
      byDay.set(k, arr);
    }
    return Array.from(byDay.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const isLoading = sessions === null;
  const isEmpty   = !isLoading && filtered && filtered.length === 0;

  return (
    <div className="screen">
      <div className="history">

        <div className="history-head">
          <div>
            <h1 className="h1">Histórico.</h1>
            <p className="lede" style={{ marginTop: 8 }}>
              Todos os seus treinos. Filtre por período e abra um treino para ver o detalhe.
            </p>
          </div>
          <button className="btn ghost" onClick={() => router.push('/route')}>
            <Icons.Arrow size={14}/> Pedalar agora
          </button>
        </div>

        <div className="history-body">

          {/* Period filters */}
          <div className="period-filters">
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map(k => (
              <button
                key={k}
                className={`chip ${period === k ? 'on' : ''}`}
                onClick={() => setPeriod(k)}
              >
                {PERIOD_LABELS[k]}
              </button>
            ))}
          </div>

          {/* Period summary */}
          {summary && summary.count > 0 && (
            <div className="period-summary">
              <div className="ps-cell">
                <span className="ps-lbl">Treinos</span>
                <span className="ps-val">{summary.count}</span>
              </div>
              <div className="ps-cell">
                <span className="ps-lbl">Distância</span>
                <span className="ps-val">{Math.round(summary.totalKm)}<small>km</small></span>
              </div>
              <div className="ps-cell">
                <span className="ps-lbl">TSS total</span>
                <span className="ps-val">{summary.totalTss}</span>
              </div>
              <div className="ps-cell">
                <span className="ps-lbl">Tempo</span>
                <span className="ps-val">{formatClock(summary.totalSec)}</span>
              </div>
              <div className="ps-cell">
                <span className="ps-lbl">Trabalho</span>
                <span className="ps-val">{formatCompact(summary.totalKj)}<small>kJ</small></span>
              </div>
            </div>
          )}

          {/* List */}
          {isLoading && (
            <div className="workout-list">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="workout-skeleton"/>)}
            </div>
          )}

          {isEmpty && (
            <div className="history-empty">
              <div className="he-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M5 18a4 4 0 100-8 4 4 0 000 8zM19 18a4 4 0 100-8 4 4 0 000 8zM12 18l-2-8h6l-2 4 2 4z"
                    stroke="var(--fg-3)" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2>Sem treinos {period === 'all' ? 'ainda' : `nos últimos ${PERIOD_LABELS[period].toLowerCase()}`}.</h2>
              <p>Conecte seus sensores, escolha uma rota e pedale. O treino aparece aqui assim que você termina.</p>
              <button className="btn primary" onClick={() => router.push('/route')}>
                Escolher rota
              </button>
            </div>
          )}

          {!isLoading && !isEmpty && groups.map(([day, items]) => (
            <div key={day}>
              <div className="day-divider">{formatDateLong(items[0].started_at)}</div>
              <div className="workout-list" style={{ marginTop: 8 }}>
                {items.map(s => (
                  <WorkoutListItem
                    key={s.id}
                    session={s}
                    prs={prMap.get(s.id) ?? []}
                    onClick={() => router.push(`/history/${s.id}`)}
                  />
                ))}
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}
