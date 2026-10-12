-- V2 · Gremios, 2.ª parte: blindaje en el servidor, crónica, ánimos y jefes por nivel.
-- Ejecutar en Supabase → SQL Editor DESPUÉS de supabase-gremios.sql. Se puede volver a ejecutar.
--
-- Qué cambia:
--   · Las metas de los encargos las calcula el servidor (no la app) y solo hay un encargo a la vez.
--   · Los aportes se recortan a lo humanamente posible (16 h de foco, 30 hábitos y 3000 XP por día).
--   · La victoria la declara el servidor recalculando la regla del 30 %; la app ya no puede marcarla.
--   · Al ganar, el servidor elige al MVP (quien más aportó a la meta).
--   · Crónica del gremio (entradas, salidas, rangos, encargos, victorias) y ánimos entre miembros.
--   · Jefes nuevos que se desbloquean con el nivel del gremio.
--   · Los rankings semanales del perfil se recortan con los mismos límites.

-- ---------- Plantillas de encargos (la verdad la tiene el servidor) ----------
create table if not exists public.guild_templates (
  id text primary key,
  days int not null,
  per jsonb not null,            -- meta por miembro { deep, habits, xp }
  min jsonb not null default '{}',
  participation numeric not null default 0,
  guild_xp int not null,
  min_level int not null default 1
);
alter table public.guild_templates enable row level security;
drop policy if exists "ver plantillas" on public.guild_templates;
create policy "ver plantillas" on public.guild_templates for select to authenticated using (true);

insert into public.guild_templates (id, days, per, min, participation, guild_xp, min_level) values
  ('cien-minutos',  7, '{"deep":30}',                          '{"deep":100}',                          0,    50, 1),
  ('pacto-habitos', 7, '{"habits":5}',                         '{"habits":12}',                         0,    50, 1),
  ('forja-comun',   7, '{"xp":250}',                           '{"xp":600}',                            0,    60, 1),
  ('dragon',        7, '{"deep":480}',                         '{"deep":960}',                          0.5, 150, 1),
  ('hidra-rota',    7, '{"deep":240,"habits":6}',              '{"deep":600,"habits":15}',              0.75, 200, 1),
  ('titan-olvido', 14, '{"deep":720,"habits":10,"xp":600}',    '{"deep":1800,"habits":30,"xp":1500}',   1,   400, 1),
  ('remolino',      7, '{"deep":360,"xp":200}',                '{"deep":900,"xp":500}',                 0.75, 250, 3),
  ('senor-excusas',14, '{"deep":900,"habits":12,"xp":800}',    '{"deep":2400,"habits":36,"xp":2000}',   1,   500, 5)
on conflict (id) do update set days = excluded.days, per = excluded.per, min = excluded.min,
  participation = excluded.participation, guild_xp = excluded.guild_xp, min_level = excluded.min_level;

-- Quién fue el MVP de un encargo ganado.
alter table public.guild_challenges add column if not exists mvp uuid references public.profiles (user_id) on delete set null;

-- ---------- Nivel del gremio ----------
create or replace function public.guild_xp(g uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(t.guild_xp), 0)::int from guild_challenges c join guild_templates t on t.id = c.template
  where c.guild_id = g and c.completed_at is not null;
$$;
-- Nivel L cuando el XP de gremio llega a 50·L·(L−1) (igual que en la app).
create or replace function public.guild_level(g uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare xp int := public.guild_xp(g); l int := 1;
begin
  while 50 * (l + 1) * l <= xp loop l := l + 1; end loop;
  return l;
end $$;

-- ---------- Al aceptar un encargo: meta, fechas y comprobaciones ----------
create or replace function public.guild_challenge_setup() returns trigger
language plpgsql security definer set search_path = public as $$
declare t guild_templates; n int; goal jsonb; k text;
begin
  select * into t from guild_templates where id = new.template;
  if t.id is null then raise exception 'Encargo desconocido' using errcode = 'P0001'; end if;
  if public.guild_level(new.guild_id) < t.min_level then
    raise exception 'Este jefe pide nivel de gremio %', t.min_level using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext(new.guild_id::text));
  if exists (select 1 from guild_challenges where guild_id = new.guild_id and completed_at is null and ends_at > now()) then
    raise exception 'Ya hay un encargo en marcha' using errcode = 'P0001';
  end if;
  n := greatest(1, (select count(*) from guild_members where guild_id = new.guild_id));
  goal := jsonb_build_object('minParticipants', greatest(1, ceil(n * t.participation))::int, 'cap', greatest(0.3, 1.0 / n));
  for k in select jsonb_object_keys(t.per) loop
    goal := goal || jsonb_build_object(k, greatest((t.per ->> k)::int * n, coalesce((t.min ->> k)::int, 0)));
  end loop;
  new.goal := goal;
  new.starts_at := now();
  new.ends_at := now() + make_interval(days => t.days);
  new.completed_at := null;
  new.mvp := null;
  return new;
end $$;
drop trigger if exists guild_challenge_setup on public.guild_challenges;
create trigger guild_challenge_setup before insert on public.guild_challenges for each row execute function public.guild_challenge_setup();

-- La app ya no puede tocar un encargo empezado: la victoria la declara guild_check_victory.
drop policy if exists "cerrar reto" on public.guild_challenges;
revoke update on public.guild_challenges from authenticated;

-- ---------- Aportes: solo durante el encargo y dentro de lo posible ----------
create or replace function public.guild_contribution_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare c guild_challenges; days int;
begin
  select * into c from guild_challenges where id = new.challenge_id;
  if c.id is null then raise exception 'Encargo desconocido' using errcode = 'P0001'; end if;
  if now() > c.ends_at + interval '1 hour' then raise exception 'El encargo ya terminó' using errcode = 'P0001'; end if;
  days := greatest(1, ceil(extract(epoch from (least(now(), c.ends_at) - c.starts_at)) / 86400))::int;
  new.deep := least(new.deep, days * 960);     -- 16 h de foco al día
  new.habits := least(new.habits, days * 30);
  new.xp := least(new.xp, days * 3000);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guild_contribution_check on public.guild_contributions;
create trigger guild_contribution_check before insert or update on public.guild_contributions for each row execute function public.guild_contribution_check();
revoke update on public.guild_contributions from authenticated;
grant update (deep, habits, xp, updated_at) on public.guild_contributions to authenticated;

-- ---------- Crónica del gremio ----------
create table if not exists public.guild_events (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds (id) on delete cascade,
  kind text not null check (kind in ('join', 'leave', 'kick', 'promote', 'demote', 'leader', 'start', 'victory', 'cheer')),
  actor uuid references public.profiles (user_id) on delete cascade,
  target uuid references public.profiles (user_id) on delete cascade,
  data jsonb not null default '{}',
  day date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists guild_events_guild on public.guild_events (guild_id, created_at desc);
-- Un ánimo al día de cada miembro a cada compañero.
create unique index if not exists guild_events_cheer on public.guild_events (actor, target, day) where kind = 'cheer';
alter table public.guild_events enable row level security;
drop policy if exists "ver crónica" on public.guild_events;
drop policy if exists "dar ánimos" on public.guild_events;
create policy "ver crónica" on public.guild_events for select to authenticated using (public.is_guild_member(guild_id));
-- La app solo escribe ánimos; lo demás lo apuntan las reglas de abajo.
create policy "dar ánimos" on public.guild_events for insert to authenticated with check (
  kind = 'cheer' and actor = auth.uid() and target <> auth.uid() and data = '{}' and day = current_date
  and public.is_guild_member(guild_id)
  and exists (select 1 from public.guild_members m where m.guild_id = guild_events.guild_id and m.user_id = target)
);
revoke update, delete on public.guild_events from authenticated;

create or replace function public.guild_log(g uuid, k text, a uuid, t uuid, d jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into guild_events (guild_id, kind, actor, target, data)
  select g, k, a, t, d where exists (select 1 from guilds where id = g);
$$;
revoke execute on function public.guild_log(uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.guild_members_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform guild_log(new.guild_id, 'join', new.user_id, null);
  elsif tg_op = 'DELETE' then
    if auth.uid() is null or auth.uid() = old.user_id then perform guild_log(old.guild_id, 'leave', old.user_id, null);
    else perform guild_log(old.guild_id, 'kick', auth.uid(), old.user_id); end if;
  elsif new.role is distinct from old.role and not exists (select 1 from guilds where id = new.guild_id and owner = new.user_id) then
    perform guild_log(new.guild_id, case when new.role = 'officer' then 'promote' else 'demote' end, auth.uid(), new.user_id);
  end if;
  return null;
end $$;
drop trigger if exists guild_members_log on public.guild_members;
create trigger guild_members_log after insert or delete or update of role on public.guild_members for each row execute function public.guild_members_log();

create or replace function public.guilds_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner is distinct from old.owner then perform guild_log(new.id, 'leader', auth.uid(), new.owner); end if;
  return null;
end $$;
drop trigger if exists guilds_log on public.guilds;
create trigger guilds_log after update of owner on public.guilds for each row execute function public.guilds_log();

create or replace function public.guild_challenges_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform guild_log(new.guild_id, 'start', new.created_by, null, jsonb_build_object('template', new.template, 'challenge', new.id));
  return null;
end $$;
drop trigger if exists guild_challenges_log on public.guild_challenges;
create trigger guild_challenges_log after insert on public.guild_challenges for each row execute function public.guild_challenges_log();

-- ---------- Victoria: la calcula el servidor ----------
-- Devuelve true si el encargo está ganado (y lo marca la primera vez, con su MVP).
create or replace function public.guild_check_victory(c uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare ch guild_challenges; total numeric; cap numeric; counted numeric; k text; won boolean := true; parts int; best uuid;
begin
  select * into ch from guild_challenges where id = c for update;
  if ch.id is null or not public.is_guild_member(ch.guild_id) then return false; end if;
  if ch.completed_at is not null then return true; end if;
  if now() > ch.ends_at + interval '1 hour' then return false; end if;
  for k in select unnest(array['deep', 'habits', 'xp']) loop
    total := coalesce((ch.goal ->> k)::numeric, 0);
    continue when total <= 0;
    cap := ceil(total * (ch.goal ->> 'cap')::numeric);
    select least(total, coalesce(sum(least(coalesce((to_jsonb(x) ->> k)::numeric, 0), cap)), 0)) into counted
      from guild_contributions x where x.challenge_id = c;
    if counted < total then won := false; end if;
  end loop;
  select count(*) into parts from guild_contributions x where x.challenge_id = c
    and ((coalesce((ch.goal ->> 'deep')::numeric, 0) > 0 and x.deep > 0)
      or (coalesce((ch.goal ->> 'habits')::numeric, 0) > 0 and x.habits > 0)
      or (coalesce((ch.goal ->> 'xp')::numeric, 0) > 0 and x.xp > 0));
  if not won or parts < coalesce((ch.goal ->> 'minParticipants')::int, 1) then return false; end if;
  -- MVP: quien más parte de la meta aportó (lo que le cuenta, sumando cada objetivo).
  select x.user_id into best from guild_contributions x where x.challenge_id = c
    order by (
      case when coalesce((ch.goal ->> 'deep')::numeric, 0) > 0 then least(x.deep, ceil((ch.goal ->> 'deep')::numeric * (ch.goal ->> 'cap')::numeric)) / (ch.goal ->> 'deep')::numeric else 0 end
    + case when coalesce((ch.goal ->> 'habits')::numeric, 0) > 0 then least(x.habits, ceil((ch.goal ->> 'habits')::numeric * (ch.goal ->> 'cap')::numeric)) / (ch.goal ->> 'habits')::numeric else 0 end
    + case when coalesce((ch.goal ->> 'xp')::numeric, 0) > 0 then least(x.xp, ceil((ch.goal ->> 'xp')::numeric * (ch.goal ->> 'cap')::numeric)) / (ch.goal ->> 'xp')::numeric else 0 end
    ) desc, (x.deep + x.habits * 30 + x.xp / 2.0) desc, x.updated_at asc
    limit 1;
  update guild_challenges set completed_at = now(), mvp = best where id = c;
  perform guild_log(ch.guild_id, 'victory', best, null, jsonb_build_object('template', ch.template, 'challenge', c));
  return true;
end $$;
revoke execute on function public.guild_check_victory(uuid) from public, anon;
grant execute on function public.guild_check_victory(uuid) to authenticated;
revoke execute on function public.guild_xp(uuid) from public, anon;
revoke execute on function public.guild_level(uuid) from public, anon;
grant execute on function public.guild_xp(uuid) to authenticated;
grant execute on function public.guild_level(uuid) to authenticated;

-- ---------- Rankings: el perfil no puede publicar semanas imposibles ----------
create or replace function public.profile_stats_clamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare w text;
begin
  foreach w in array array['week', 'prev'] loop
    if jsonb_typeof(new.stats -> w) = 'object' then
      new.stats := jsonb_set(new.stats, array[w], (new.stats -> w) || jsonb_build_object(
        'xp', least(greatest(coalesce((new.stats -> w ->> 'xp')::numeric, 0), 0), 21000)::int,
        'deep', least(greatest(coalesce((new.stats -> w ->> 'deep')::numeric, 0), 0), 6720)::int,
        'habits', least(greatest(coalesce((new.stats -> w ->> 'habits')::numeric, 0), 0), 210)::int));
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists profile_stats_clamp on public.profiles;
create trigger profile_stats_clamp before insert or update of stats on public.profiles for each row execute function public.profile_stats_clamp();
