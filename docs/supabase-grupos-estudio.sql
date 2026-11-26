-- Academy · Grupos de estudio. Ejecutar UNA vez en Supabase → SQL Editor (después de las tablas study_* de Academy
-- y de supabase-amigos.sql). Se puede volver a ejecutar sin romper nada.
--
-- Como en Google Docs: creas un grupo, invitas a amigos (o compartes un enlace) y cada persona es
--   · lector  → ve las asignaturas del grupo (temas, hojas y tarjetas) y puede copiarlas a su estantería;
--   · editor  → además cambia hojas, temas y tarjetas, comparte sus asignaturas e invita a amigos.
-- Quien crea el grupo es el propietario: cambia papeles, quita gente, gestiona los enlaces y borra el grupo.
--
-- Las tarjetas compartidas siguen siendo del dueño de la asignatura: su memoria (fechas de repaso, FSRS) solo la
-- cambia él. Los demás estudian con «Copiar a mi estantería», que hace una copia propia con las tarjetas a cero.

-- ---------- Tablas ----------
create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.study_group_members (
  group_id uuid not null references public.study_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'reader')),
  added_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists study_group_members_user on public.study_group_members (user_id);

create table if not exists public.study_group_subjects (
  group_id uuid not null references public.study_groups (id) on delete cascade,
  subject_id uuid not null references public.study_subjects (id) on delete cascade,
  shared_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  shared_at timestamptz not null default now(),
  primary key (group_id, subject_id)
);
create index if not exists study_group_subjects_subject on public.study_group_subjects (subject_id);

-- Un enlace por papel y grupo. Cambiar el enlace = token nuevo (el viejo deja de servir).
create table if not exists public.study_group_links (
  group_id uuid not null references public.study_groups (id) on delete cascade,
  role text not null check (role in ('editor', 'reader')),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  primary key (group_id, role)
);

-- ---------- Ayudantes (security definer: leen grupos ajenos sin entrar en bucle con las reglas) ----------
create or replace function public.study_group_role(g uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from study_group_members where group_id = g and user_id = auth.uid();
$$;

create or replace function public.study_my_group_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select group_id from study_group_members where user_id = auth.uid();
$$;

-- Asignaturas de otros que puedo ver (edit = true: solo las que puedo editar).
create or replace function public.study_shared_subject_ids(edit boolean default false) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct gs.subject_id
  from study_group_subjects gs
  join study_group_members m on m.group_id = gs.group_id and m.user_id = auth.uid()
  where not edit or m.role in ('owner', 'editor');
$$;

create or replace function public.study_shared_topic_ids(edit boolean default false) returns setof uuid
language sql stable security definer set search_path = public as $$
  select t.id from study_topics t where t.subject_id in (select public.study_shared_subject_ids(edit));
$$;

revoke execute on function public.study_group_role(uuid) from public, anon;
revoke execute on function public.study_my_group_ids() from public, anon;
revoke execute on function public.study_shared_subject_ids(boolean) from public, anon;
revoke execute on function public.study_shared_topic_ids(boolean) from public, anon;
grant execute on function public.study_group_role(uuid) to authenticated;
grant execute on function public.study_my_group_ids() to authenticated;
grant execute on function public.study_shared_subject_ids(boolean) to authenticated;
grant execute on function public.study_shared_topic_ids(boolean) to authenticated;

-- ---------- Reglas de los grupos ----------
alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;
alter table public.study_group_subjects enable row level security;
alter table public.study_group_links enable row level security;

drop policy if exists "ver mis grupos" on public.study_groups;
drop policy if exists "crear grupo" on public.study_groups;
drop policy if exists "renombrar mi grupo" on public.study_groups;
drop policy if exists "borrar mi grupo" on public.study_groups;
create policy "ver mis grupos" on public.study_groups for select to authenticated
  using (id in (select public.study_my_group_ids()) or owner_id = auth.uid());
create policy "crear grupo" on public.study_groups for insert to authenticated with check (owner_id = auth.uid());
create policy "renombrar mi grupo" on public.study_groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "borrar mi grupo" on public.study_groups for delete to authenticated using (owner_id = auth.uid());

-- Miembros: los ves si estás en el grupo. Entrar solo por las funciones de abajo (amigo o enlace).
drop policy if exists "ver miembros" on public.study_group_members;
drop policy if exists "cambiar papel" on public.study_group_members;
drop policy if exists "quitar o salir" on public.study_group_members;
create policy "ver miembros" on public.study_group_members for select to authenticated
  using (group_id in (select public.study_my_group_ids()));
create policy "cambiar papel" on public.study_group_members for update to authenticated
  using (public.study_group_role(group_id) = 'owner' and role <> 'owner')
  with check (public.study_group_role(group_id) = 'owner' and role in ('editor', 'reader'));
create policy "quitar o salir" on public.study_group_members for delete to authenticated
  using (role <> 'owner' and (user_id = auth.uid() or public.study_group_role(group_id) = 'owner'));

-- Asignaturas del grupo: compartes las tuyas si eres propietario o editor; las quita quien la compartió o el propietario.
drop policy if exists "ver asignaturas del grupo" on public.study_group_subjects;
drop policy if exists "compartir asignatura" on public.study_group_subjects;
drop policy if exists "dejar de compartir" on public.study_group_subjects;
create policy "ver asignaturas del grupo" on public.study_group_subjects for select to authenticated
  using (group_id in (select public.study_my_group_ids()));
create policy "compartir asignatura" on public.study_group_subjects for insert to authenticated with check (
  shared_by = auth.uid()
  and public.study_group_role(group_id) in ('owner', 'editor')
  and exists (select 1 from public.study_subjects s where s.id = subject_id and s.user_id = auth.uid())
);
create policy "dejar de compartir" on public.study_group_subjects for delete to authenticated
  using (shared_by = auth.uid() or public.study_group_role(group_id) = 'owner');

-- Enlaces: los ven y copian propietario y editores; solo el propietario los crea, cambia o apaga.
drop policy if exists "ver enlaces" on public.study_group_links;
drop policy if exists "crear enlace" on public.study_group_links;
drop policy if exists "cambiar enlace" on public.study_group_links;
drop policy if exists "apagar enlace" on public.study_group_links;
create policy "ver enlaces" on public.study_group_links for select to authenticated
  using (public.study_group_role(group_id) in ('owner', 'editor'));
create policy "crear enlace" on public.study_group_links for insert to authenticated
  with check (public.study_group_role(group_id) = 'owner');
create policy "cambiar enlace" on public.study_group_links for update to authenticated
  using (public.study_group_role(group_id) = 'owner') with check (public.study_group_role(group_id) = 'owner');
create policy "apagar enlace" on public.study_group_links for delete to authenticated
  using (public.study_group_role(group_id) = 'owner');

-- Quien crea el grupo entra como propietario.
create or replace function public.study_group_owner_joins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into study_group_members (group_id, user_id, role, added_by) values (new.id, new.owner_id, 'owner', new.owner_id)
  on conflict (group_id, user_id) do update set role = 'owner';
  return new;
end $$;
drop trigger if exists study_group_owner_joins on public.study_groups;
create trigger study_group_owner_joins after insert on public.study_groups
  for each row execute function public.study_group_owner_joins();

-- Quien sale (o es quitado) se lleva sus asignaturas del grupo.
create or replace function public.study_group_member_left() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from study_group_subjects where group_id = old.group_id and shared_by = old.user_id;
  return old;
end $$;
drop trigger if exists study_group_member_left on public.study_group_members;
create trigger study_group_member_left after delete on public.study_group_members
  for each row execute function public.study_group_member_left();

-- ---------- Entrar en un grupo ----------
-- Máximo de personas por grupo.
create or replace function public.study_group_full(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) >= 30 from study_group_members where group_id = g;
$$;
revoke execute on function public.study_group_full(uuid) from public, anon, authenticated;

-- Añadir a un amigo (como en Docs: entra al momento). Propietario y editores; solo amigos aceptados.
-- Si ya estaba, el propietario puede cambiarle el papel; un editor nunca baja a nadie.
create or replace function public.study_group_add_friend(g uuid, friend uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_role text; cur text;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if new_role not in ('editor', 'reader') then raise exception 'Papel no válido'; end if;
  select role into my_role from study_group_members where group_id = g and user_id = me;
  if my_role is null or my_role = 'reader' then raise exception 'Solo el propietario y los editores pueden invitar' using errcode = '42501'; end if;
  if not exists (
    select 1 from friendships f where f.status = 'accepted'
      and least(f.requester, f.addressee) = least(me, friend) and greatest(f.requester, f.addressee) = greatest(me, friend)
  ) then raise exception 'Solo puedes invitar a tus amigos' using errcode = '42501'; end if;
  select role into cur from study_group_members where group_id = g and user_id = friend;
  if cur is null then
    if public.study_group_full(g) then raise exception 'El grupo está lleno (30 personas)'; end if;
    insert into study_group_members (group_id, user_id, role, added_by) values (g, friend, new_role, me);
  elsif cur <> 'owner' and (my_role = 'owner' or (cur = 'reader' and new_role = 'editor')) then
    update study_group_members set role = new_role where group_id = g and user_id = friend;
  end if;
end $$;

-- Ver adónde lleva un enlace antes de entrar (nombre, papel, cuántos son y quién lo creó).
create or replace function public.study_group_peek(link text)
returns table (group_id uuid, name text, role text, members int, owner_name text, already text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, l.role,
         (select count(*)::int from study_group_members m where m.group_id = g.id),
         coalesce((select p.name from profiles p where p.user_id = g.owner_id), ''),
         (select m.role from study_group_members m where m.group_id = g.id and m.user_id = auth.uid())
  from study_group_links l join study_groups g on g.id = l.group_id
  where l.token = link and auth.uid() is not null;
$$;

-- Entrar con un enlace. Si ya estabas como lector y el enlace es de editor, subes; nunca bajas.
create or replace function public.study_group_join(link text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l record; cur text;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  select * into l from study_group_links where token = link;
  if l is null then raise exception 'Este enlace ya no sirve: pide uno nuevo' using errcode = 'P0002'; end if;
  select role into cur from study_group_members where group_id = l.group_id and user_id = me;
  if cur is null then
    if public.study_group_full(l.group_id) then raise exception 'El grupo está lleno (30 personas)'; end if;
    insert into study_group_members (group_id, user_id, role) values (l.group_id, me, l.role);
  elsif cur = 'reader' and l.role = 'editor' then
    update study_group_members set role = 'editor' where group_id = l.group_id and user_id = me;
  end if;
  return l.group_id;
end $$;

revoke execute on function public.study_group_add_friend(uuid, uuid, text) from public, anon;
revoke execute on function public.study_group_peek(text) from public, anon;
revoke execute on function public.study_group_join(text) from public, anon;
grant execute on function public.study_group_add_friend(uuid, uuid, text) to authenticated;
grant execute on function public.study_group_peek(text) to authenticated;
grant execute on function public.study_group_join(text) to authenticated;

-- ---------- Ver y editar lo compartido (se suman a las reglas «mis …» de Academy) ----------
drop policy if exists "ver asignaturas compartidas" on public.study_subjects;
create policy "ver asignaturas compartidas" on public.study_subjects for select to authenticated
  using (id in (select public.study_shared_subject_ids(false)));

drop policy if exists "ver temas compartidos" on public.study_topics;
drop policy if exists "crear temas compartidos" on public.study_topics;
drop policy if exists "editar temas compartidos" on public.study_topics;
drop policy if exists "borrar temas compartidos" on public.study_topics;
create policy "ver temas compartidos" on public.study_topics for select to authenticated
  using (subject_id in (select public.study_shared_subject_ids(false)));
create policy "crear temas compartidos" on public.study_topics for insert to authenticated
  with check (subject_id in (select public.study_shared_subject_ids(true)));
create policy "editar temas compartidos" on public.study_topics for update to authenticated
  using (subject_id in (select public.study_shared_subject_ids(true)))
  with check (subject_id in (select public.study_shared_subject_ids(true)));
create policy "borrar temas compartidos" on public.study_topics for delete to authenticated
  using (subject_id in (select public.study_shared_subject_ids(true)));

drop policy if exists "ver hojas compartidas" on public.study_pages;
drop policy if exists "crear hojas compartidas" on public.study_pages;
drop policy if exists "editar hojas compartidas" on public.study_pages;
drop policy if exists "borrar hojas compartidas" on public.study_pages;
create policy "ver hojas compartidas" on public.study_pages for select to authenticated
  using (topic_id in (select public.study_shared_topic_ids(false)));
create policy "crear hojas compartidas" on public.study_pages for insert to authenticated
  with check (topic_id in (select public.study_shared_topic_ids(true)));
create policy "editar hojas compartidas" on public.study_pages for update to authenticated
  using (topic_id in (select public.study_shared_topic_ids(true)))
  with check (topic_id in (select public.study_shared_topic_ids(true)));
create policy "borrar hojas compartidas" on public.study_pages for delete to authenticated
  using (topic_id in (select public.study_shared_topic_ids(true)));

drop policy if exists "ver tarjetas compartidas" on public.study_cards;
drop policy if exists "crear tarjetas compartidas" on public.study_cards;
drop policy if exists "editar tarjetas compartidas" on public.study_cards;
drop policy if exists "borrar tarjetas compartidas" on public.study_cards;
create policy "ver tarjetas compartidas" on public.study_cards for select to authenticated
  using (topic_id in (select public.study_shared_topic_ids(false)));
create policy "crear tarjetas compartidas" on public.study_cards for insert to authenticated
  with check (topic_id in (select public.study_shared_topic_ids(true)));
create policy "editar tarjetas compartidas" on public.study_cards for update to authenticated
  using (topic_id in (select public.study_shared_topic_ids(true)))
  with check (topic_id in (select public.study_shared_topic_ids(true)));
create policy "borrar tarjetas compartidas" on public.study_cards for delete to authenticated
  using (topic_id in (select public.study_shared_topic_ids(true)));

-- Lo que crea un editor pasa a ser del dueño de la asignatura (así le sale en su estantería y en su repaso).
-- Estos disparadores se llaman «…_a_shared» para ir ANTES que «…_owner», que comprueba que todo sea del mismo dueño.
create or replace function public.study_topic_to_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from study_subjects where id = new.subject_id;
  if owner is not null and owner <> auth.uid() and new.subject_id in (select public.study_shared_subject_ids(true)) then
    new.user_id := owner;
  end if;
  return new;
end $$;

create or replace function public.study_page_to_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from study_topics where id = new.topic_id;
  if owner is not null and owner <> auth.uid() and new.topic_id in (select public.study_shared_topic_ids(true)) then
    new.user_id := owner;
  end if;
  return new;
end $$;

-- Tarjetas: además, la memoria (fechas, FSRS, apartada) es del dueño. Un editor solo toca pregunta, respuesta y tema.
create or replace function public.study_card_to_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from study_topics where id = new.topic_id;
  if owner is null or owner = auth.uid() then return new; end if;
  if new.topic_id not in (select public.study_shared_topic_ids(true)) then return new; end if;
  new.user_id := owner;
  if tg_op = 'INSERT' then
    new.due := now(); new.stability := 0; new.difficulty := 0; new.elapsed_days := 0; new.scheduled_days := 0;
    new.learning_steps := 0; new.reps := 0; new.lapses := 0; new.state := 0; new.last_review := null;
    new.suspended := false;
  else
    new.due := old.due; new.stability := old.stability; new.difficulty := old.difficulty;
    new.elapsed_days := old.elapsed_days; new.scheduled_days := old.scheduled_days; new.learning_steps := old.learning_steps;
    new.reps := old.reps; new.lapses := old.lapses; new.state := old.state; new.last_review := old.last_review;
    new.suspended := old.suspended; new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists study_topics_a_shared on public.study_topics;
create trigger study_topics_a_shared before insert or update on public.study_topics
  for each row execute function public.study_topic_to_owner();
drop trigger if exists study_pages_a_shared on public.study_pages;
create trigger study_pages_a_shared before insert or update on public.study_pages
  for each row execute function public.study_page_to_owner();
drop trigger if exists study_cards_a_shared on public.study_cards;
create trigger study_cards_a_shared before insert or update on public.study_cards
  for each row execute function public.study_card_to_owner();

-- ---------- Copiar a mi estantería ----------
-- Copia una asignatura que puedes ver (temas, hojas y tarjetas) como tuya, con las tarjetas sin empezar.
create or replace function public.study_copy_subject(src uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s record; t record; new_subject uuid; new_topic uuid; pos int;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  select * into s from study_subjects where id = src;
  if s is null or (s.user_id <> me and src not in (select public.study_shared_subject_ids(false))) then
    raise exception 'No puedes ver esa asignatura' using errcode = '42501';
  end if;
  select coalesce(max(position) + 1, 0) into pos from study_subjects where user_id = me;
  insert into study_subjects (user_id, name, color, position, level)
    values (me, left(s.name, 80), s.color, pos, s.level) returning id into new_subject;
  for t in select * from study_topics where subject_id = src order by position loop
    insert into study_topics (user_id, subject_id, title, position, exam_date)
      values (me, new_subject, t.title, t.position, null) returning id into new_topic;
    insert into study_pages (user_id, topic_id, title, content, position)
      select me, new_topic, p.title, p.content, p.position from study_pages p where p.topic_id = t.id;
    insert into study_cards (user_id, topic_id, front, back, note_key, created_at)
      select me, new_topic, c.front, c.back, c.note_key, c.created_at from study_cards c where c.topic_id = t.id;
  end loop;
  return new_subject;
end $$;
revoke execute on function public.study_copy_subject(uuid) from public, anon;
grant execute on function public.study_copy_subject(uuid) to authenticated;
