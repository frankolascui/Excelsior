-- V2 · Amigos. Ejecutar una vez en Supabase → SQL Editor (después de supabase.sql).
-- Perfil público de cada jugador (lo que ven los demás) y amistades.

-- ---------- Perfiles ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tag text not null,                 -- «Nicolas#4821»: con esto te añaden
  name text not null,
  bio text not null default '',
  photo text,                        -- foto pequeña (JPEG 192 px en data URL)
  level int not null default 1,
  xp int not null default 0,
  avatar_index int not null default 0,
  avatar_name text not null default '',
  stats jsonb not null default '{}', -- niveles de atributo, logros, horas de Deep Work…
  updated_at timestamptz not null default now(),
  constraint profiles_tag_format check (tag ~ '^[^#]{1,24}#[0-9]{4}$'),
  constraint profiles_bio_len check (char_length(bio) <= 280),
  constraint profiles_photo_len check (photo is null or char_length(photo) <= 60000)
);
create unique index if not exists profiles_tag_lower on public.profiles (lower(tag));

alter table public.profiles enable row level security;
-- Cualquier jugador con cuenta ve los perfiles; cada uno solo crea y edita el suyo.
create policy "ver perfiles" on public.profiles for select to authenticated using (true);
create policy "crear mi perfil" on public.profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "editar mi perfil" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Amistades ----------
create table if not exists public.friendships (
  requester uuid not null references public.profiles (user_id) on delete cascade,
  addressee uuid not null references public.profiles (user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- Una sola relación por pareja, la pida quien la pida.
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;
-- Solo ves tus relaciones; envías solicitudes en tu nombre; solo quien la recibe la acepta; cualquiera de los dos la borra.
create policy "ver mis amistades" on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy "enviar solicitud" on public.friendships for insert to authenticated with check (auth.uid() = requester and status = 'pending');
create policy "aceptar solicitud" on public.friendships for update to authenticated using (auth.uid() = addressee) with check (auth.uid() = addressee and status = 'accepted');
create policy "borrar amistad" on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));

-- ---------- Recomendados ----------
-- Amigos de tus amigos primero (por amigos en común) y después jugadores de nivel parecido.
-- security definer: necesita ver amistades ajenas, pero solo devuelve perfiles públicos.
create or replace function public.recommended_friends(max_rows int default 12)
returns table (
  user_id uuid, tag text, name text, bio text, photo text, level int, xp int,
  avatar_index int, avatar_name text, stats jsonb, mutual int
)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  mine as (
    select case when f.requester = (select id from me) then f.addressee else f.requester end as fid, f.status
    from friendships f where (select id from me) in (f.requester, f.addressee)
  ),
  fof as (
    select case when f.requester = m.fid then f.addressee else f.requester end as cand, count(*)::int as mutual
    from friendships f join mine m on m.status = 'accepted' and m.fid in (f.requester, f.addressee)
    where f.status = 'accepted'
    group by 1
  ),
  my as (select p.level from profiles p where p.user_id = (select id from me))
  select p.user_id, p.tag, p.name, p.bio, p.photo, p.level, p.xp, p.avatar_index, p.avatar_name, p.stats,
         coalesce(fof.mutual, 0) as mutual
  from profiles p left join fof on fof.cand = p.user_id
  where (select id from me) is not null
    and p.user_id <> (select id from me)
    and p.user_id not in (select fid from mine)
  order by coalesce(fof.mutual, 0) desc, abs(p.level - coalesce((select level from my), 1)), p.updated_at desc
  limit least(greatest(max_rows, 1), 30);
$$;
revoke execute on function public.recommended_friends(int) from public, anon;
grant execute on function public.recommended_friends(int) to authenticated;
