'use client';

/**
 * RouteFilters — search + chip filters + sort dropdown.
 *
 * Pure controlled component. Parent owns the state and applies the
 * filters via `useMemo` so the work happens once per change.
 *
 * Performance target (Sprint 6): < 100 ms on 100 routes. The actual
 * filter loop is in the parent — this file is pure UI.
 */

import { ChangeEvent } from 'react';
import { Icons } from '@/components/icons';

export type DistanceBucket  = 'all' | '0-30' | '30-60' | '60-100' | '100+';
export type ElevationBucket = 'all' | 'flat' | 'mixed' | 'mountain';
export type DurationBucket  = 'all' | '0-30' | '30-60' | '60-120' | '120+';
export type DoneFilter      = 'all' | 'done' | 'new';
export type SortKey = 'recent' | 'most-used' | 'distance' | 'elevation' | 'difficulty';

export interface RouteFiltersState {
  search:    string;
  distance:  DistanceBucket;
  elevation: ElevationBucket;
  duration:  DurationBucket;
  done:      DoneFilter;
  sort:      SortKey;
}

export const DEFAULT_FILTERS: RouteFiltersState = {
  search: '', distance: 'all', elevation: 'all', duration: 'all', done: 'all', sort: 'recent',
};

interface RouteFiltersProps {
  value:    RouteFiltersState;
  onChange: (next: RouteFiltersState) => void;
  /** Total routes currently visible (for the count chip). */
  visible:  number;
  /** Total routes before filtering (for the secondary count). */
  total:    number;
}

const DISTANCE_LABELS: Record<DistanceBucket, string> = {
  'all':    'Todas distâncias',
  '0-30':   '0–30 km',
  '30-60':  '30–60 km',
  '60-100': '60–100 km',
  '100+':   '100 km+',
};

const ELEVATION_LABELS: Record<ElevationBucket, string> = {
  'all':      'Toda elevação',
  'flat':     'Plana (<300m)',
  'mixed':    'Mista (300–800m)',
  'mountain': 'Montanhosa (>800m)',
};

const DURATION_LABELS: Record<DurationBucket, string> = {
  'all':    'Toda duração',
  '0-30':   '0–30 min',
  '30-60':  '30–60 min',
  '60-120': '1–2 h',
  '120+':   '2 h+',
};

const DONE_LABELS: Record<DoneFilter, string> = {
  'all':  'Todas',
  'done': 'Já feita',
  'new':  'Nunca feita',
};

const SORT_LABELS: Record<SortKey, string> = {
  'recent':     'Mais recentes',
  'most-used':  'Mais usadas',
  'distance':   'Distância',
  'elevation':  'Elevação',
  'difficulty': 'Dificuldade',
};

export function RouteFilters({ value, onChange, visible, total }: RouteFiltersProps) {
  function set<K extends keyof RouteFiltersState>(k: K, v: RouteFiltersState[K]) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div className="route-filters">
      {/* Search row */}
      <div className="route-filters-search">
        <Icons.Search size={14} c="var(--fg-3)"/>
        <input
          type="text"
          placeholder="Buscar por nome ou local…"
          value={value.search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => set('search', e.target.value)}
          aria-label="Buscar rotas"
        />
        {value.search && (
          <button
            className="route-filters-clear"
            onClick={() => set('search', '')}
            aria-label="Limpar busca"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filter + sort row */}
      <div className="route-filters-row">
        <SelectChip
          label={DISTANCE_LABELS[value.distance]}
          options={DISTANCE_LABELS}
          value={value.distance}
          onChange={v => set('distance', v as DistanceBucket)}
          active={value.distance !== 'all'}
        />
        <SelectChip
          label={ELEVATION_LABELS[value.elevation]}
          options={ELEVATION_LABELS}
          value={value.elevation}
          onChange={v => set('elevation', v as ElevationBucket)}
          active={value.elevation !== 'all'}
        />
        <SelectChip
          label={DURATION_LABELS[value.duration]}
          options={DURATION_LABELS}
          value={value.duration}
          onChange={v => set('duration', v as DurationBucket)}
          active={value.duration !== 'all'}
        />
        <SelectChip
          label={DONE_LABELS[value.done]}
          options={DONE_LABELS}
          value={value.done}
          onChange={v => set('done', v as DoneFilter)}
          active={value.done !== 'all'}
        />

        <div className="route-filters-spacer"/>

        <SelectChip
          label={`Ordenar: ${SORT_LABELS[value.sort]}`}
          options={SORT_LABELS}
          value={value.sort}
          onChange={v => set('sort', v as SortKey)}
          active
        />

        <div className="route-filters-count">
          {visible}
          {visible !== total && <span className="of">/{total}</span>}
        </div>
      </div>
    </div>
  );
}

// ── SelectChip — native <select> styled as a pill ────────────────────────────

interface SelectChipProps {
  label:    string;
  options:  Record<string, string>;
  value:    string;
  onChange: (v: string) => void;
  active:   boolean;
}

function SelectChip({ label, options, value, onChange, active }: SelectChipProps) {
  return (
    <label className={`route-filter-chip ${active ? 'active' : ''}`}>
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
    </label>
  );
}
