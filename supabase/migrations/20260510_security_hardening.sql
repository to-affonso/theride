-- The Ride — segurança RLS + ownership em routes + endurecimento de funções
-- Correr UMA VEZ no SQL Editor do Supabase (ou via CLI) após o schema inicial.
-- Requer: extensão pgcrypto (gen_random_uuid) já usada no projeto.
--
-- Rotas (routes): não há limite de quantidade de rotas por utilizador nem teto
-- ao tamanho de gpx_data — só RLS (dono), trigger de nome e created_by automático.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Coluna de dono em routes (NULL = rota de sistema / seed)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.routes
  add column if not exists created_by uuid references auth.users (id) on delete set null;

create index if not exists routes_created_by_idx on public.routes (created_by);

comment on column public.routes.created_by is
  'Utilizador que criou a rota; NULL para rotas seed/sistema. DELETE/UPDATE só para o dono.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Trigger INSERT: define sempre created_by = auth.uid() (ignora valor enviado)
--    Avaliado antes do WITH CHECK das políticas RLS.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.routes_set_created_by()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists routes_set_created_by on public.routes;
create trigger routes_set_created_by
  before insert on public.routes
  for each row
  execute function public.routes_set_created_by();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Trigger UPDATE: só permite alterar a coluna name
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.routes_enforce_name_only_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.id is distinct from new.id
     or old.location is distinct from new.location
     or old.distance_km is distinct from new.distance_km
     or old.elevation_m is distinct from new.elevation_m
     or old.estimated_time_min is distinct from new.estimated_time_min
     or old.difficulty is distinct from new.difficulty
     or old.type is distinct from new.type
     or old.gpx_data is distinct from new.gpx_data
     or old.created_at is distinct from new.created_at
     or old.created_by is distinct from new.created_by
  then
    raise exception 'Apenas a coluna "name" pode ser atualizada em public.routes';
  end if;
  return new;
end;
$$;

drop trigger if exists routes_enforce_name_only_update on public.routes;
create trigger routes_enforce_name_only_update
  before update on public.routes
  for each row
  execute function public.routes_enforce_name_only_update();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Políticas routes — substituir as antigas
--    (INSERT ilimitado em número/tamanho para utilizadores autenticados; só exige dono.)
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "routes: readable by all authenticated users" on public.routes;
drop policy if exists "routes: authenticated users can insert" on public.routes;
drop policy if exists "routes: authenticated users can delete own gpx routes" on public.routes;
drop policy if exists "routes_select_authenticated" on public.routes;
drop policy if exists "routes_insert_authenticated" on public.routes;
drop policy if exists "routes_update_owner_name_only" on public.routes;
drop policy if exists "routes_delete_owner" on public.routes;

create policy "routes_select_authenticated"
  on public.routes for select
  to authenticated
  using (true);

create policy "routes_insert_authenticated"
  on public.routes for insert
  to authenticated
  with check (
    auth.role() = 'authenticated'
    and created_by = auth.uid()
  );

create policy "routes_update_owner_name_only"
  on public.routes for update
  to authenticated
  using (created_by is not null and auth.uid() = created_by)
  with check (created_by is not null and auth.uid() = created_by);

create policy "routes_delete_owner"
  on public.routes for delete
  to authenticated
  using (created_by is not null and auth.uid() = created_by);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) athletes — políticas explícitas (WITH CHECK explícito)
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "athletes: own rows only" on public.athletes;
drop policy if exists "athletes_select_own" on public.athletes;
drop policy if exists "athletes_insert_own" on public.athletes;
drop policy if exists "athletes_update_own" on public.athletes;
drop policy if exists "athletes_delete_own" on public.athletes;

create policy "athletes_select_own"
  on public.athletes for select to authenticated
  using (auth.uid() = user_id);

create policy "athletes_insert_own"
  on public.athletes for insert to authenticated
  with check (auth.uid() = user_id);

create policy "athletes_update_own"
  on public.athletes for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "athletes_delete_own"
  on public.athletes for delete to authenticated
  using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) sessions — USING + WITH CHECK explícitos
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "sessions: own rows only" on public.sessions;
drop policy if exists "sessions_select_own" on public.sessions;
drop policy if exists "sessions_insert_own" on public.sessions;
drop policy if exists "sessions_update_own" on public.sessions;
drop policy if exists "sessions_delete_own" on public.sessions;

create policy "sessions_select_own"
  on public.sessions for select to authenticated
  using (
    athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
  );

create policy "sessions_insert_own"
  on public.sessions for insert to authenticated
  with check (
    athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
  );

create policy "sessions_update_own"
  on public.sessions for update to authenticated
  using (
    athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
  )
  with check (
    athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
  );

create policy "sessions_delete_own"
  on public.sessions for delete to authenticated
  using (
    athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) handle_updated_at — search_path fixo
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) handle_new_user — search_path + sem execute público desnecessário
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.athletes (user_id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9) (Opcional) Rotas GPX antigas sem created_by — corrigir manualmente, ex.:
--    update public.routes set created_by = '<uuid-do-user>'::uuid
--    where gpx_data is not null and created_by is null;
--    Até corrigir, ninguém (via anon/authenticated) consegue UPDATE/DELETE essas linhas.
-- ═══════════════════════════════════════════════════════════════════════════
