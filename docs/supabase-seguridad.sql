-- Refuerzos tras la revisión del 2026-11-12. Ejecutar una vez en Supabase → SQL Editor. Se puede volver a ejecutar.
-- No borra ni cambia datos.

-- 1) La foto de perfil solo puede ser una imagen incrustada (data URL), nunca una dirección externa:
--    una dirección externa dejaría a su dueño ver la IP de quien abre su perfil.
--    (Si falla al ejecutar, alguna foto guardada no cumple: avisa y lo miramos.)
alter table public.profiles drop constraint if exists profiles_photo_data;
alter table public.profiles add constraint profiles_photo_data
  check (photo is null or photo ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$');

-- 2) Límite de tamaño de la partida y del perfil público (nadie puede llenar la base de datos con una fila gigante).
alter table public.saves drop constraint if exists saves_state_size;
alter table public.saves add constraint saves_state_size check (pg_column_size(state) < 5000000) not valid;
alter table public.profiles drop constraint if exists profiles_stats_size;
alter table public.profiles add constraint profiles_stats_size check (pg_column_size(stats) < 8192) not valid;
alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles add constraint profiles_name_len check (char_length(name) <= 40 and char_length(avatar_name) <= 60) not valid;

-- 3) El nivel y el XP de un gremio solo los consultan sus miembros.
create or replace function public.guild_xp(g uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(t.guild_xp), 0)::int from guild_challenges c join guild_templates t on t.id = c.template
  where c.guild_id = g and c.completed_at is not null
    and (auth.uid() is null or public.is_guild_member(g));
$$;
