-- The Ride — Migration 001: Extended schema for performance analytics
-- Run after schema.sql. Idempotent (uses IF NOT EXISTS).
-- Purpose: enable Sprint 1+ features (history, expanded post-ride, dashboard, onboarding).

-- ============================================================================
-- 1. ATHLETES: goals + form tracking + Strava integration
-- ============================================================================

alter table public.athletes add column if not exists primary_goal text
  check (primary_goal in ('ftp','event','consistency','weight') or primary_goal is null);
alter table public.athletes add column if not exists goal_target  jsonb;
alter table public.athletes add column if not exists goal_deadline date;

-- CTL = Chronic Training Load (fitness, 42-day EWMA of TSS)
-- ATL = Acute Training Load (fatigue, 7-day EWMA of TSS)
-- TSB = Training Stress Balance (form = CTL - ATL)
alter table public.athletes add column if not exists ctl numeric(6,2) not null default 0;
alter table public.athletes add column if not exists atl numeric(6,2) not null default 0;
alter table public.athletes add column if not exists tsb numeric(6,2) not null default 0;
alter table public.athletes add column if not exists load_updated_at timestamptz;

-- Strava integration
alter table public.athletes add column if not exists strava_athlete_id        text;
alter table public.athletes add column if not exists strava_access_token      text;
alter table public.athletes add column if not exists strava_refresh_token     text;
alter table public.athletes add column if not exists strava_token_expires_at  timestamptz;
alter table public.athletes add column if not exists strava_connected_at      timestamptz;

-- ============================================================================
-- 2. SESSIONS: advanced metrics + time series
-- ============================================================================

-- Advanced power metrics
alter table public.sessions add column if not exists normalized_power  integer;   -- NP
alter table public.sessions add column if not exists intensity_factor  numeric(4,3);  -- IF = NP/FTP
alter table public.sessions add column if not exists variability_index numeric(4,3);  -- VI = NP/avgPower
alter table public.sessions add column if not exists max_power         integer;
alter table public.sessions add column if not exists max_hr            integer;
alter table public.sessions add column if not exists avg_cadence       integer;
alter table public.sessions add column if not exists kj                integer;       -- work done
alter table public.sessions add column if not exists total_ascent_m    integer;

-- Time series (cadence, speed, gradient)
alter table public.sessions add column if not exists cadence_series   integer[]     not null default '{}';
alter table public.sessions add column if not exists speed_series     numeric(4,1)[] not null default '{}';
alter table public.sessions add column if not exists gradient_series  numeric(4,2)[] not null default '{}';

-- Computed aggregates (stored as JSON for flexibility)
-- best_power: { "5s": 980, "30s": 620, "1min": 480, "5min": 340, "20min": 295, "60min": 270 }
alter table public.sessions add column if not exists best_power jsonb not null default '{}';

-- power_zone_seconds: { "z1": 120, "z2": 1800, "z3": 900, "z4": 600, "z5": 180 }
alter table public.sessions add column if not exists power_zone_seconds jsonb not null default '{}';
alter table public.sessions add column if not exists hr_zone_seconds    jsonb not null default '{}';

-- Context
alter table public.sessions add column if not exists ftp_at_time       integer;
alter table public.sessions add column if not exists notes             text not null default '';
alter table public.sessions add column if not exists strava_activity_id text;
alter table public.sessions add column if not exists strava_exported_at timestamptz;

-- ============================================================================
-- 3. FTP HISTORY: track FTP changes over time
-- ============================================================================

create table if not exists public.ftp_history (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid references public.athletes(id) on delete cascade not null,
  ftp         integer not null check (ftp between 50 and 600),
  source      text    not null check (source in (
    'manual',
    'test_20min',
    'test_8min',
    'test_ramp',
    'strava_estimate',
    'session_detection'
  )),
  notes       text,
  recorded_at timestamptz not null default now()
);

alter table public.ftp_history enable row level security;

create policy "ftp_history: own rows only"
  on public.ftp_history for all
  using (athlete_id in (select id from public.athletes where user_id = auth.uid()));

create index if not exists ftp_history_athlete_idx
  on public.ftp_history (athlete_id, recorded_at desc);

-- ============================================================================
-- 4. DAILY LOAD: daily CTL/ATL/TSB snapshots for dashboard chart
-- ============================================================================

create table if not exists public.daily_load (
  athlete_id  uuid references public.athletes(id) on delete cascade not null,
  day         date not null,
  tss_day     integer not null default 0,
  ctl         numeric(6,2) not null,
  atl         numeric(6,2) not null,
  tsb         numeric(6,2) not null,
  primary key (athlete_id, day)
);

alter table public.daily_load enable row level security;

create policy "daily_load: own rows only"
  on public.daily_load for all
  using (athlete_id in (select id from public.athletes where user_id = auth.uid()));

create index if not exists daily_load_athlete_day_idx
  on public.daily_load (athlete_id, day desc);

-- ============================================================================
-- 5. SESSION_LAPS: laps (auto or manual) inside a session
-- ============================================================================

create table if not exists public.session_laps (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid references public.sessions(id) on delete cascade not null,
  lap_number      integer not null,
  type            text not null check (type in ('auto','manual')),
  started_at_s    integer not null,                    -- seconds since session start
  duration_s      integer not null,
  distance_km     numeric(6,2) not null default 0,
  avg_power       integer not null default 0,
  normalized_power integer,
  avg_hr          integer not null default 0,
  avg_cadence     integer not null default 0,
  avg_speed       numeric(5,2),
  elevation_gain  integer not null default 0
);

alter table public.session_laps enable row level security;

create policy "session_laps: own rows only"
  on public.session_laps for all
  using (
    session_id in (
      select s.id from public.sessions s
      join public.athletes a on a.id = s.athlete_id
      where a.user_id = auth.uid()
    )
  );

create index if not exists session_laps_session_idx
  on public.session_laps (session_id, lap_number);

-- ============================================================================
-- 6. PERFORMANCE INDEXES on sessions for history and comparisons
-- ============================================================================

-- For history list ordering and filtering
create index if not exists sessions_athlete_started_idx
  on public.sessions (athlete_id, started_at desc);

-- For "compare to last attempt on same route"
create index if not exists sessions_route_athlete_idx
  on public.sessions (route_id, athlete_id, started_at desc)
  where route_id is not null;

-- ============================================================================
-- 7. ROUTES: extra metadata for filtering/categorization
-- ============================================================================

alter table public.routes add column if not exists profile_thumb_svg text;
alter table public.routes add column if not exists times_ridden_by_user integer default 0;
-- Note: times_ridden_by_user is denormalized cache; compute server-side
