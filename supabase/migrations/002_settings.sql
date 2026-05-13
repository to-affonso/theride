-- 002_settings.sql — Configurações screen new fields
--
-- Adds athlete preferences that were previously implicit in client state:
--   * birth_date            — for dynamic age display
--   * power_smoothing_seconds — was a UI toggle (1s/3s); now persisted, expanded
--   * auto_lap_enabled / auto_lap_distance_km — auto-lap defaults read by /live
--   * hr_zones              — custom HR zone upper bounds (6 numbers = Z1..Z6;
--                             Z7 is implicit catch-all). Stored as fractions of
--                             max_hr so it stays valid if max_hr changes.
--
-- Safe to re-run: every column uses `if not exists`.

alter table public.athletes
  add column if not exists birth_date date,
  add column if not exists power_smoothing_seconds smallint not null default 3
    check (power_smoothing_seconds in (1, 3, 5, 10)),
  add column if not exists auto_lap_enabled boolean not null default true,
  add column if not exists auto_lap_distance_km numeric(4,1) not null default 5.0
    check (auto_lap_distance_km > 0 and auto_lap_distance_km <= 100),
  add column if not exists hr_zones jsonb not null default
    '[0.45, 0.65, 0.75, 0.82, 0.89, 0.94]'::jsonb;

-- Shape check on hr_zones (array of length 6). Constraint is conditional —
-- if you've already added it, the do-block skips it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hr_zones_shape'
  ) then
    alter table public.athletes
      add constraint hr_zones_shape check (
        jsonb_typeof(hr_zones) = 'array'
        and jsonb_array_length(hr_zones) = 6
      );
  end if;
end$$;

-- Backfill any rows missing defaults (should be none, but safe).
update public.athletes set hr_zones = '[0.45,0.65,0.75,0.82,0.89,0.94]'::jsonb
  where hr_zones is null;
