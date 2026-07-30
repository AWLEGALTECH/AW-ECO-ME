-- Fixar processos ("pin") em dois modos:
--  • geral: todos os usuários veem — flag na própria linha do processo.
--  • pessoal: só o usuário que fixou vê — tabela por usuário.
alter table public.processos
  add column if not exists fixado_geral boolean not null default false;

create table if not exists public.processo_fixados (
  user_id uuid not null references auth.users(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, processo_id)
);

alter table public.processo_fixados enable row level security;

-- Cada usuário só enxerga e mexe nos próprios pins pessoais.
drop policy if exists "fixados_self_all" on public.processo_fixados;
create policy "fixados_self_all" on public.processo_fixados
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
