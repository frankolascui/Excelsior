-- V3.5 · Blindaje de aportes de gremio y rankings. Ejecutar en Supabase → SQL Editor DESPUÉS de
-- supabase-gremios.sql, supabase-gremios-2.sql y supabase-seguridad.sql. Se puede volver a ejecutar.
-- No borra datos: solo añade dos columnas y cambia reglas.
--
-- El problema: cada app sube sus propios números (foco, hábitos, XP) y el servidor solo los recortaba a
-- «lo posible en un día». Con eso alguien podía, por ejemplo, poner 16 h de foco en el primer minuto de un
-- encargo, meter cuentas de relleno que entran, aportan y se van, o publicar un XP total inventado.
--
-- Qué cambia (todo se comprueba al escribir, con una o dos búsquedas por clave: casi no carga Supabase):
--   1. Aportes al ritmo del reloj: lo aportado no puede superar lo que da tiempo a hacer desde que empezó el
--      encargo o desde que entraste en el gremio (lo que sea más tarde). Foco: los minutos transcurridos más una
--      sesión larga (4 h) y nunca más de 16 h por día. Hábitos: 30 por día. XP: 3000 por día, repartidos por
--      horas, con un margen inicial de 1500.
--   2. Lo hecho antes de entrar en el gremio no cuenta (la app ya calcula igual desde esta versión).
--   3. La victoria y el MVP solo cuentan a los miembros actuales y a quienes ya estaban al empezar el encargo:
--      las cuentas que entran a mitad, aportan y se van dejan de contar.
--   4. Perfil público: el nivel lo calcula el servidor a partir del XP, y el XP total solo puede subir
--      ~3000 al día (con reserva de 2 días: 6000). Bajar (desgaste) siempre se puede.
--   5. Rankings semanales: el XP, foco y hábitos de una semana se limitan según lo que ha pasado de esa
--      semana (antes valían 21000 XP desde el lunes por la mañana). Una semana futura o mal escrita cuenta 0.
--
-- Lo que no se puede evitar: los datos nacen en el dispositivo de cada uno, así que el servidor solo acota a
-- lo humanamente posible. Hacer trampa sigue pidiendo editar la partida a mano, y ya no da ventajas grandes.

-- ---------- 1 y 2. Aportes ----------
-- Desde cuándo era miembro quien aporta (para la victoria: ver 3).
alter table public.guild_contributions add column if not exists member_since timestamptz;
update public.guild_contributions x set member_since = m.joined_at
  from public.guild_members m, public.guild_challenges c
  where x.member_since is null and c.id = x.challenge_id and m.user_id = x.user_id and m.guild_id = c.guild_id;

create or replace function public.guild_contribution_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare c guild_challenges; joined timestamptz; since timestamptz; el numeric; days int;
begin
  select * into c from guild_challenges where id = new.challenge_id;
  if c.id is null then raise exception 'Encargo desconocido' using errcode = 'P0001'; end if;
  if now() > c.ends_at + interval '1 hour' then raise exception 'El encargo ya terminó' using errcode = 'P0001'; end if;
  select m.joined_at into joined from guild_members m where m.user_id = new.user_id and m.guild_id = c.guild_id;
  if joined is null then raise exception 'No eres miembro de este gremio' using errcode = 'P0001'; end if;
  since := greatest(c.starts_at, joined);
  el := greatest(0, extract(epoch from (least(now(), c.ends_at) - since)) / 86400);   -- días transcurridos (con decimales)
  days := greatest(1, ceil(el))::int;
  new.deep := greatest(0, least(new.deep, days * 960, 240 + floor(el * 1440)))::int;
  new.habits := greatest(0, least(new.habits, days * 30, 15 + floor(el * 30)))::int;
  new.xp := greatest(0, least(new.xp, days * 3000, 1500 + floor(el * 3000)))::int;
  new.member_since := joined;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guild_contribution_check on public.guild_contributions;
create trigger guild_contribution_check before insert or update on public.guild_contributions for each row execute function public.guild_contribution_check();
-- La app solo puede cambiar sus números; member_since lo pone el servidor.
revoke update on public.guild_contributions from authenticated;
grant update (deep, habits, xp, updated_at) on public.guild_contributions to authenticated;

-- ---------- 3. Victoria: solo cuentan miembros actuales y los que estaban desde el principio ----------
create or replace function public.guild_counted_contributions(c uuid)
returns setof public.guild_contributions
language sql stable security definer set search_path = public as $$
  select x.* from guild_contributions x join guild_challenges ch on ch.id = x.challenge_id
  where x.challenge_id = c
    and (exists (select 1 from guild_members m where m.user_id = x.user_id and m.guild_id = ch.guild_id)
         or x.member_since <= ch.starts_at);
$$;
revoke execute on function public.guild_counted_contributions(uuid) from public, anon, authenticated;

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
      from guild_counted_contributions(c) x;
    if counted < total then won := false; end if;
  end loop;
  select count(*) into parts from guild_counted_contributions(c) x
    where (coalesce((ch.goal ->> 'deep')::numeric, 0) > 0 and x.deep > 0)
       or (coalesce((ch.goal ->> 'habits')::numeric, 0) > 0 and x.habits > 0)
       or (coalesce((ch.goal ->> 'xp')::numeric, 0) > 0 and x.xp > 0);
  if not won or parts < coalesce((ch.goal ->> 'minParticipants')::int, 1) then return false; end if;
  -- MVP: quien más parte de la meta aportó (lo que le cuenta, sumando cada objetivo).
  select x.user_id into best from guild_counted_contributions(c) x
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

-- ---------- 4. Perfil: nivel desde el XP y XP total al ritmo del reloj ----------
alter table public.profiles add column if not exists xp_checked_at timestamptz;

create or replace function public.level_for_xp(x int) returns int
language plpgsql immutable as $$
declare l int := greatest(1, floor((1 + sqrt(1 + greatest(x, 0) / 12.5)) / 2)::int);
begin
  -- Igual que la app: nivel L desde 50·L·(L−1) XP. El bucle corrige redondeos.
  while 50 * (l + 1) * l <= x loop l := l + 1; end loop;
  while l > 1 and 50 * l * (l - 1) > x loop l := l - 1; end loop;
  return l;
end $$;

-- Cubo de XP: se rellena a 3000 por día hasta 6000. Subir el XP gasta del cubo; si no llega, se recorta y la
-- siguiente publicación lo pone al día. xp_checked_at = momento en que el cubo estaría vacío.
create or replace function public.profile_xp_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare rate constant numeric := 3000; cap constant numeric := 6000; avail numeric; inc numeric;
begin
  new.xp := greatest(new.xp, 0);
  if tg_op = 'UPDATE' then
    if new.xp > old.xp then
      avail := least(cap, rate * extract(epoch from (now() - coalesce(old.xp_checked_at, now() - interval '2 days'))) / 86400);
      inc := least(new.xp - old.xp, floor(greatest(avail, 0)));
      new.xp := old.xp + inc::int;
      new.xp_checked_at := now() - make_interval(secs => ((greatest(avail, 0) - inc) / rate * 86400)::double precision);
    else
      new.xp_checked_at := old.xp_checked_at;
    end if;
    new.updated_at := now();
  end if;
  new.level := public.level_for_xp(new.xp);
  return new;
end $$;
drop trigger if exists profile_xp_guard on public.profiles;
create trigger profile_xp_guard before insert or update on public.profiles for each row execute function public.profile_xp_guard();

-- ---------- 5. Rankings semanales al ritmo de la semana ----------
-- Cada semana se identifica por su lunes («2026-11-16»). Se mide lo transcurrido desde ese lunes en la zona
-- horaria que antes empieza el día (UTC+14), así nadie en el mundo queda por debajo de lo que de verdad pudo hacer.
create or replace function public.profile_stats_clamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare w text; k text; el numeric;
begin
  foreach w in array array['week', 'prev'] loop
    if jsonb_typeof(new.stats -> w) = 'object' then
      k := new.stats -> w ->> 'key';
      if k ~ '^\d{4}-\d{2}-\d{2}$' and to_char(to_date(k, 'YYYY-MM-DD'), 'YYYY-MM-DD') = k then
        el := extract(epoch from (now() - (to_date(k, 'YYYY-MM-DD')::timestamp at time zone 'Pacific/Kiritimati'))) / 86400;
      else
        el := -1;
      end if;
      el := least(el, 7);
      if el < 0 then
        new.stats := jsonb_set(new.stats, array[w], (new.stats -> w) || '{"xp":0,"deep":0,"habits":0}');
      else
        new.stats := jsonb_set(new.stats, array[w], (new.stats -> w) || jsonb_build_object(
          'xp', least(greatest(coalesce((new.stats -> w ->> 'xp')::numeric, 0), 0), 1500 + floor(el * 3000), 21000)::int,
          'deep', least(greatest(coalesce((new.stats -> w ->> 'deep')::numeric, 0), 0), 240 + floor(el * 1440), ceil(greatest(el, 0.01)) * 960, 6720)::int,
          'habits', least(greatest(coalesce((new.stats -> w ->> 'habits')::numeric, 0), 0), 15 + floor(el * 30), 210)::int));
      end if;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists profile_stats_clamp on public.profiles;
create trigger profile_stats_clamp before insert or update of stats on public.profiles for each row execute function public.profile_stats_clamp();

-- Comprobación: debe salir una fila con las tres columnas a true.
select
  exists (select 1 from information_schema.columns where table_name = 'guild_contributions' and column_name = 'member_since') as aportes_ok,
  exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'xp_checked_at') as perfil_ok,
  exists (select 1 from pg_proc where proname = 'guild_counted_contributions') as victoria_ok;
