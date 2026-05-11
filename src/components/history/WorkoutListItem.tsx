'use client';

/**
 * Row in the history list. Renders one session: title, key metrics,
 * sparkline, dominant zone badge, optional PR badge.
 */

import { Session } from '@/types';
import { SparkLine } from '@/components/charts/SparkLine';
import { POWER_ZONES, PowerZoneId } from '@/lib/zones';
import { formatClock } from '@/lib/format';
import type { MmpKey } from '@/lib/metrics';

interface WorkoutListItemProps {
  session: Session;
  /** Set of MMP window keys where this session set a PR. */
  prs?: MmpKey[];
  onClick: () => void;
}

const MMP_LABELS: Record<MmpKey, string> = {
  '5s':    '5s',
  '30s':   '30s',
  '1min':  '1min',
  '5min':  '5min',
  '20min': '20min',
  '60min': '1h',
};

export function WorkoutListItem({ session, prs = [], onClick }: WorkoutListItemProps) {
  const ftp = session.ftp_at_time ?? 200;
  const np  = session.normalized_power ?? session.avg_power;
  const iF  = session.intensity_factor ?? (ftp > 0 ? np / ftp : 0);

  const dominant = dominantZoneOf(session.power_zone_seconds);
  const zoneInfo = dominant ? POWER_ZONES.find(z => z.id === dominant) : null;

  // Route name fallback chain: joined route → session.notes → "Sessão livre"
  const title = session.routes?.name ?? 'Sessão livre';
  const location = session.routes?.location;

  return (
    <button className="workout-item" onClick={onClick} type="button">
      <div className="wi-main">
        <div className="wi-title">
          {title}
          {location && (
            <span style={{ color: 'var(--fg-3)', fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
              · {location}
            </span>
          )}
        </div>
        <div className="wi-meta">
          <span><b>{formatClock(session.duration_s)}</b></span>
          <span className="sep">·</span>
          <span><b>{session.distance_km.toFixed(1)}</b> km</span>
          <span className="sep">·</span>
          <span><b>{np}</b> W{session.normalized_power ? ' NP' : ' avg'}</span>
          <span className="sep">·</span>
          <span><b>{session.tss}</b> TSS</span>
          {iF > 0 && (
            <>
              <span className="sep">·</span>
              <span>IF <b>{iF.toFixed(2)}</b></span>
            </>
          )}
        </div>
      </div>

      <div className="wi-spark">
        <SparkLine data={session.power_series} width={140} height={32} />
      </div>

      <div className="wi-side">
        {zoneInfo && (
          <span className="zone-badge">
            <i style={{ background: zoneInfo.color }} />
            {zoneInfo.label} {zoneInfo.name}
          </span>
        )}
        {prs.length > 0 && (
          <span className="pr-badge" title={`Novo PR em ${prs.join(', ')}`}>
            ↑ PR {MMP_LABELS[prs[0]]}{prs.length > 1 ? ` +${prs.length - 1}` : ''}
          </span>
        )}
      </div>
    </button>
  );
}

function dominantZoneOf(zoneSeconds: Session['power_zone_seconds']): PowerZoneId | null {
  if (!zoneSeconds) return null;
  let bestId: PowerZoneId | null = null;
  let bestSec = -1;
  for (const z of POWER_ZONES) {
    const sec = zoneSeconds[z.id] ?? 0;
    if (sec > bestSec) {
      bestSec = sec;
      bestId = z.id;
    }
  }
  return bestSec > 0 ? bestId : null;
}
