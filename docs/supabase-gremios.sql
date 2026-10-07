-- V2 · Gremios. Ejecutar una vez en Supabase → SQL Editor (después de supabase-amigos.sql).
-- Gremio de hasta 8 amigos, invitaciones, retos (misiones y jefes de gremio) y lo que aporta cada miembro.

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

-- ---------- Reglas por fila ----------
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_invites enable row level security;
alter table public.guild_challenges enable row level security;
alter table public.guild_contributions enable row level security;

-- Nombre y emblema de cualquier gremio son visibles (para ver a qué te invitan).
create policy "ver gremios" on public.guilds for select to authenticated using (true);
create policy "fundar gremio" on public.guilds for insert to authenticated with check (owner = auth.uid());
-- Solo el líder lo edita; puede ceder el liderazgo a otro miembro.
create policy "editar mi gremio" on public.guilds for update to authenticated
  using (owner = auth.uid())
  with check (exists (select 1 from public.guild_members m where m.guild_id = id and m.user_id = owner));
create policy "disolver mi gremio" on public.guilds for delete to authenticated using (owner = auth.uid());

create policy "ver miembros" on public.guild_members for select to authenticated using (true);
-- Entras si eres el líder (al fundarlo) o si tienes invitación.
create policy "entrar en gremio" on public.guild_members for insert to authenticated with check (
  user_id = auth.uid() and (
    exists (select 1 from public.guilds g where g.id = guild_id and g.owner = auth.uid())
    or exists (select 1 from public.guild_invites i where i.guild_id = guild_members.guild_id and i.user_id = auth.uid())
  )
);
-- Sales tú, o te expulsa el líder.
create policy "salir o expulsar" on public.guild_members for delete to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.guilds g where g.id = guild_id and g.owner = auth.uid())
);

create policy "ver invitaciones" on public.guild_invites for select to authenticated using (user_id = auth.uid() or public.is_guild_member(guild_id));
create policy "invitar" on public.guild_invites for insert to authenticated with check (invited_by = auth.uid() and public.is_guild_member(guild_id));
create policy "borrar invitación" on public.guild_invites for delete to authenticated using (user_id = auth.uid() or public.is_guild_member(guild_id));

create policy "ver retos" on public.guild_challenges for select to authenticated using (public.is_guild_member(guild_id));
create policy "empezar reto" on public.guild_challenges for insert to authenticated with check (created_by = auth.uid() and public.is_guild_member(guild_id));
create policy "cerrar reto" on public.guild_challenges for update to authenticated using (public.is_guild_member(guild_id)) with check (public.is_guild_member(guild_id));

create policy "ver aportaciones" on public.guild_contributions for select to authenticated using (public.is_guild_member(public.challenge_guild(challenge_id)));
create policy "subir mi aportación" on public.guild_contributions for insert to authenticated with check (user_id = auth.uid() and public.is_guild_member(public.challenge_guild(challenge_id)));
create policy "actualizar mi aportación" on public.guild_contributions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_guild_member(public.challenge_guild(challenge_id)));
