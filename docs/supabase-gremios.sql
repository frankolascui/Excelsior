-- V2 · Gremios. Ejecutar en Supabase → SQL Editor (después de supabase-amigos.sql).
-- Se puede volver a ejecutar sin perder datos: añade lo que falte y rehace las reglas.
-- Gremio de hasta 8 amigos con rangos (líder, colíderes y miembros), invitaciones,
-- encargos (misiones y jefes de gremio) y lo que aporta cada miembro.

-- ---------- Gremios ----------
create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 32),
  emblem text not null default '🛡️' check (char_length(emblem) <= 8),
  motto text not null default '' check (char_length(motto) <= 80),
  owner uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Un jugador solo está en un gremio a la vez.
create table if not exists public.guild_members (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  guild_id uuid not null references public.guilds (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists guild_members_guild on public.guild_members (guild_id);
-- Rango: el líder es guilds.owner; aquí, colíder ('officer') o miembro.
alter table public.guild_members add column if not exists role text not null default 'member';
alter table public.guild_members drop constraint if exists guild_members_role;
alter table public.guild_members add constraint guild_members_role check (role in ('officer', 'member'));
-- Del miembro solo se puede cambiar el rango (y solo el líder: ver reglas).
revoke update on public.guild_members from authenticated;
grant update (role) on public.guild_members to authenticated;

create table if not exists public.guild_invites (
  guild_id uuid not null references public.guilds (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  invited_by uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

-- Retos: misiones (cortas) y jefes (grandes). La meta y el tope por persona se fijan al empezar.
create table if not exists public.guild_challenges (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds (id) on delete cascade,
  template text not null,
  goal jsonb not null,                 -- { deep, habits, xp, minParticipants, cap }
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  completed_at timestamptz,            -- cuando se cumplió la meta
  created_by uuid not null references public.profiles (user_id) on delete cascade
);
create index if not exists guild_challenges_guild on public.guild_challenges (guild_id, starts_at desc);
-- De un encargo empezado solo se puede marcar que se cumplió.
revoke update on public.guild_challenges from authenticated;
grant update (completed_at) on public.guild_challenges to authenticated;

-- Lo que cada miembro lleva hecho en el reto (lo sube su propia app).
create table if not exists public.guild_contributions (
  challenge_id uuid not null references public.guild_challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  deep int not null default 0 check (deep >= 0),
  habits int not null default 0 check (habits >= 0),
  xp int not null default 0 check (xp >= 0),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- ---------- Ayudas para las reglas ----------
create or replace function public.is_guild_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guild_members where guild_id = g and user_id = auth.uid());
$$;
create or replace function public.challenge_guild(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select guild_id from guild_challenges where id = c;
$$;
-- ¿Puedo mandar en este gremio? (líder o colíder)
create or replace function public.is_guild_officer(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guilds where id = g and owner = auth.uid())
      or exists (select 1 from guild_members where guild_id = g and user_id = auth.uid() and role = 'officer');
$$;
create or replace function public.is_guild_owner(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guilds where id = g and owner = auth.uid());
$$;
revoke execute on function public.is_guild_officer(uuid) from public, anon;
revoke execute on function public.is_guild_owner(uuid) from public, anon;
grant execute on function public.is_guild_officer(uuid) to authenticated;
grant execute on function public.is_guild_owner(uuid) to authenticated;
revoke execute on function public.is_guild_member(uuid) from public, anon;
revoke execute on function public.challenge_guild(uuid) from public, anon;
grant execute on function public.is_guild_member(uuid) to authenticated;
grant execute on function public.challenge_guild(uuid) to authenticated;

-- Máximo 8 miembros por gremio.
create or replace function public.guild_member_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from guild_members where guild_id = new.guild_id) >= 8 then
    raise exception 'El gremio está lleno (8 miembros)' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists guild_member_limit on public.guild_members;
create trigger guild_member_limit before insert on public.guild_members for each row execute function public.guild_member_limit();

-- Máximo 2 colíderes por gremio.
create or replace function public.guild_officer_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'officer' and (select count(*) from guild_members where guild_id = new.guild_id and role = 'officer' and user_id <> new.user_id) >= 2 then
    raise exception 'Ya hay 2 colíderes' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists guild_officer_limit on public.guild_members;
create trigger guild_officer_limit before insert or update of role on public.guild_members for each row execute function public.guild_officer_limit();

-- ---------- Reglas por fila ----------
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_invites enable row level security;
alter table public.guild_challenges enable row level security;
alter table public.guild_contributions enable row level security;

-- Se rehacen todas para poder volver a ejecutar el archivo.
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('guilds', 'guild_members', 'guild_invites', 'guild_challenges', 'guild_contributions') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Nombre y emblema de cualquier gremio son visibles (para ver a qué te invitan).
create policy "ver gremios" on public.guilds for select to authenticated using (true);
create policy "fundar gremio" on public.guilds for insert to authenticated with check (owner = auth.uid());
-- Solo el líder lo edita; puede ceder el liderazgo a otro miembro.
create policy "editar mi gremio" on public.guilds for update to authenticated
  using (owner = auth.uid())
  with check (exists (select 1 from public.guild_members m where m.guild_id = id and m.user_id = owner));
create policy "disolver mi gremio" on public.guilds for delete to authenticated using (owner = auth.uid());

create policy "ver miembros" on public.guild_members for select to authenticated using (true);
-- Entras como miembro si eres el líder (al fundarlo) o si tienes invitación.
create policy "entrar en gremio" on public.guild_members for insert to authenticated with check (
  user_id = auth.uid() and role = 'member' and (
    exists (select 1 from public.guilds g where g.id = guild_id and g.owner = auth.uid())
    or exists (select 1 from public.guild_invites i where i.guild_id = guild_members.guild_id and i.user_id = auth.uid())
  )
);
-- Sales tú; el líder expulsa a cualquiera; un colíder, solo a miembros rasos.
create policy "salir o expulsar" on public.guild_members for delete to authenticated using (
  user_id = auth.uid()
  or public.is_guild_owner(guild_id)
  or (role = 'member' and public.is_guild_officer(guild_id)
      and not exists (select 1 from public.guilds g where g.id = guild_id and g.owner = guild_members.user_id))
);
-- Solo el líder nombra o quita colíderes.
create policy "cambiar rango" on public.guild_members for update to authenticated
  using (public.is_guild_owner(guild_id)) with check (public.is_guild_owner(guild_id));

-- Invitan el líder y los colíderes.
create policy "ver invitaciones" on public.guild_invites for select to authenticated using (user_id = auth.uid() or public.is_guild_member(guild_id));
create policy "invitar" on public.guild_invites for insert to authenticated with check (invited_by = auth.uid() and public.is_guild_officer(guild_id));
create policy "borrar invitación" on public.guild_invites for delete to authenticated using (user_id = auth.uid() or public.is_guild_officer(guild_id));

-- Encargos: solo el líder y los colíderes los aceptan; todos ven y aportan.
create policy "ver retos" on public.guild_challenges for select to authenticated using (public.is_guild_member(guild_id));
create policy "empezar reto" on public.guild_challenges for insert to authenticated with check (created_by = auth.uid() and public.is_guild_officer(guild_id));
create policy "cerrar reto" on public.guild_challenges for update to authenticated using (public.is_guild_member(guild_id)) with check (public.is_guild_member(guild_id));

create policy "ver aportaciones" on public.guild_contributions for select to authenticated using (public.is_guild_member(public.challenge_guild(challenge_id)));
create policy "subir mi aportación" on public.guild_contributions for insert to authenticated with check (user_id = auth.uid() and public.is_guild_member(public.challenge_guild(challenge_id)));
create policy "actualizar mi aportación" on public.guild_contributions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_guild_member(public.challenge_guild(challenge_id)));
