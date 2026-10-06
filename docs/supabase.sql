-- Ejecutar una vez en Supabase → SQL Editor.
-- Una fila por jugador con su partida completa (el mismo JSON que hoy vive en localStorage).
create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

-- Cada jugador solo ve y escribe su propia partida.
create policy "leer mi partida" on public.saves for select using (auth.uid() = user_id);
create policy "crear mi partida" on public.saves for insert with check (auth.uid() = user_id);
create policy "actualizar mi partida" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
