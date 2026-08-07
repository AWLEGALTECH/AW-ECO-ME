-- Chamados (beta): hub de demandas internas (bug / implementação / ideia).
-- Qualquer usuário aprovado abre um chamado e todos enxergam o que está aberto;
-- quem resolve (dev/admin) muda status e registra a resolução.

create table if not exists public.chamados (
  id                 uuid primary key default gen_random_uuid(),
  titulo             text not null,
  tipo               text not null default 'bug'
                       check (tipo in ('bug','implementacao','ideia')),
  sistema            text,                 -- aba/área: writer, finder, processos, geral...
  prioridade         text not null default 'media'
                       check (prioridade in ('baixa','media','alta')),
  referencia         text,                 -- processo/cliente/link específico (livre)
  observacoes        text,                 -- descrição detalhada
  status             text not null default 'aberto'
                       check (status in ('aberto','em_andamento','resolvido')),
  created_by         uuid not null default auth.uid(),
  autor_nome         text,
  resolvido_por      uuid,
  resolvido_por_nome text,
  resolvido_em       timestamptz,
  resolucao          text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists chamados_status_idx on public.chamados (status, created_at desc);

alter table public.chamados enable row level security;

-- Hub compartilhado: todo mundo aprovado lê tudo.
drop policy if exists chamados_select on public.chamados;
create policy chamados_select on public.chamados for select to authenticated using (true);

-- Cada um abre em seu nome.
drop policy if exists chamados_insert on public.chamados;
create policy chamados_insert on public.chamados for insert to authenticated
  with check (created_by = auth.uid());

-- Edita/resolve: admin (quem lê e resolve) ou o próprio autor.
drop policy if exists chamados_update on public.chamados;
create policy chamados_update on public.chamados for update to authenticated
  using (public.fn_is_admin() or created_by = auth.uid())
  with check (public.fn_is_admin() or created_by = auth.uid());

drop policy if exists chamados_delete on public.chamados;
create policy chamados_delete on public.chamados for delete to authenticated
  using (public.fn_is_admin() or created_by = auth.uid());

-- updated_at automático.
create or replace function public.fn_chamados_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_chamados_touch on public.chamados;
create trigger trg_chamados_touch before update on public.chamados
  for each row execute function public.fn_chamados_touch();

-- Realtime pro hub atualizar sozinho.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname='supabase_realtime' and schemaname='public' and tablename='chamados'
  ) then
    alter publication supabase_realtime add table public.chamados;
  end if;
end $$;
