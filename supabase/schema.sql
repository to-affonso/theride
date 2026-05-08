-- The Ride — Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables

-- ── Athletes ────────────────────────────────────────────────────────────────
create table if not exists public.athletes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null unique,
  name       text not null default '',
  ftp        integer not null default 200,
  weight     numeric(5,1) not null default 70.0,
  max_hr     integer not null default 190,
  bike       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.athletes enable row level security;

create policy "athletes: own rows only"
  on public.athletes for all
  using (auth.uid() = user_id);

-- ── Routes ──────────────────────────────────────────────────────────────────
create table if not exists public.routes (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  location            text not null default '',
  distance_km         numeric(6,2) not null,
  elevation_m         integer not null default 0,
  estimated_time_min  integer not null default 60,
  difficulty          smallint not null check (difficulty between 1 and 5),
  type                text not null check (type in ('Hills','Recovery','Climb','Endurance','Sprint')),
  gpx_data            jsonb,
  created_at          timestamptz not null default now()
);

alter table public.routes enable row level security;

create policy "routes: readable by all authenticated users"
  on public.routes for select
  using (auth.role() = 'authenticated');

create policy "routes: authenticated users can insert"
  on public.routes for insert
  with check (auth.role() = 'authenticated');

create policy "routes: authenticated users can delete own gpx routes"
  on public.routes for delete
  using (auth.role() = 'authenticated' and gpx_data is not null);

-- Seed default routes (matches MVP data)
insert into public.routes (name, location, distance_km, elevation_m, estimated_time_min, difficulty, type) values
  ('Estrada Real — Tiradentes', 'Minas Gerais, BR',   24.6, 412, 58, 3, 'Hills'),
  ('Volta ao Lago Negro',        'Bariloche, AR',      18.2, 188, 42, 2, 'Recovery'),
  ('Subida do Stelvio (parcial)','Lombardia, IT',      11.4, 864, 72, 5, 'Climb'),
  ('Costa do Sol — Búzios',      'Rio de Janeiro, BR', 32.0, 240, 65, 2, 'Endurance'),
  ('Pyrenees Sprint',            'Catalunya, ES',       8.4, 120, 22, 3, 'Sprint')
on conflict do nothing;

-- ── Sessions ─────────────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  athlete_id       uuid references public.athletes(id) on delete cascade not null,
  route_id         uuid references public.routes(id) on delete set null,
  started_at       timestamptz not null default now(),
  duration_s       integer not null default 0,
  avg_power        integer not null default 0,
  avg_hr           integer not null default 0,
  calories         integer not null default 0,
  distance_km      numeric(6,2) not null default 0,
  tss              integer not null default 0,
  power_series     integer[] not null default '{}',
  hr_series        integer[] not null default '{}',
  devices          jsonb not null default '{"trainer":null,"cadence":null,"hr":null}',
  created_at       timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "sessions: own rows only"
  on public.sessions for all
  using (
    athlete_id in (
      select id from public.athletes where user_id = auth.uid()
    )
  );

create index sessions_athlete_id_idx on public.sessions (athlete_id, started_at desc);

-- ── Updated_at trigger ───────────────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger athletes_updated_at
  before update on public.athletes
  for each row execute function public.handle_updated_at();

-- ── Auto-create athlete profile on signup ────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.athletes (user_id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
