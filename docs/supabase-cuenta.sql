-- V2 · Cuenta: borrar la cuenta desde la app y fundar gremios a partir del nivel 10.
-- Ejecutar en Supabase → SQL Editor DESPUÉS de supabase-gremios-2.sql. Se puede volver a ejecutar.

-- ---------- Lo que deja quien se va ----------
-- Los encargos que aceptó y la crónica se quedan en su gremio (sin su nombre): antes se borraban con su perfil.
alter table public.guild_challenges alter column created_by drop not null;
alter table public.guild_challenges drop constraint if exists guild_challenges_created_by_fkey;
alter table public.guild_challenges add constraint guild_challenges_created_by_fkey
  foreign key (created_by) references public.profiles (user_id) on delete set null;
alter table public.guild_events drop constraint if exists guild_events_actor_fkey;
alter table public.guild_events add constraint guild_events_actor_fkey
  foreign key (actor) references public.profiles (user_id) on delete set null;
alter table public.guild_events drop constraint if exists guild_events_target_fkey;
alter table public.guild_events add constraint guild_events_target_fkey
  foreign key (target) references public.profiles (user_id) on delete set null;

-- ---------- Borrar mi cuenta ----------
-- Borra partida, perfil, amistades, invitaciones, aportes y el usuario de acceso. Si era líder de un gremio,
-- lo hereda el colíder más antiguo (o el miembro más antiguo); si era el último, el gremio se disuelve.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid(); g record; heir uuid;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  for g in select id from public.guilds where owner = me loop
    select user_id into heir from public.guild_members
      where guild_id = g.id and user_id <> me
      order by (role = 'officer') desc, joined_at asc limit 1;
    if heir is null then
      delete from public.guilds where id = g.id;
    else
      update public.guild_members set role = 'member' where guild_id = g.id and user_id = heir;
      update public.guilds set owner = heir where id = g.id;
    end if;
  end loop;
  delete from public.guild_members where user_id = me;
  delete from public.saves where user_id = me;
  delete from public.profiles where user_id = me;   -- arrastra amistades, invitaciones y aportes
  delete from auth.users where id = me;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- Fundar gremio: nivel 10 ----------
-- (Entrar por invitación sigue abierto desde el nivel 5; eso lo controla la app.)
drop policy if exists "fundar gremio" on public.guilds;
create policy "fundar gremio" on public.guilds for insert to authenticated with check (
  owner = auth.uid() and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.level >= 10)
);
