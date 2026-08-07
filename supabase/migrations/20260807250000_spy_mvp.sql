-- AW SPY (beta) — MVP Fase 1 dentro do AW ECO.
-- Titular = o próprio cliente. Cada análise gera relatório + flags estruturadas.
-- Tabelas namespaced `spy_`; a Fase 2 (grafo/entidades) virá em cima disso.

create table if not exists public.spy_analise (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid references public.clientes(id) on delete cascade,
  status      text not null default 'processando',  -- processando|concluida|erro
  arquivos    jsonb not null default '[]'::jsonb,     -- [{id,name}] selecionados no Drive
  relatorio   text,                                    -- narrativa (markdown)
  resumo      jsonb,                                    -- {renda, perfil, familia, janela...}
  modelo      text,
  erro        text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists spy_analise_cliente_idx on public.spy_analise (cliente_id, created_at desc);

create table if not exists public.spy_flag (
  id          uuid primary key default gen_random_uuid(),
  analise_id  uuid references public.spy_analise(id) on delete cascade,
  cliente_id  uuid references public.clientes(id) on delete cascade,
  eixo        text,   -- financeira|credores|produtos|consumo|vulnerabilidade|perfil|temporal
  codigo      text,   -- ex.: FIN.SUPERENDIVIDAMENTO
  label       text,
  valor       jsonb not null default '{}'::jsonb,
  confianca   numeric,
  origem      text default 'llm',   -- deterministico|llm|humano
  evidencia   text,
  created_at  timestamptz not null default now()
);
create index if not exists spy_flag_cliente_idx on public.spy_flag (cliente_id);
create index if not exists spy_flag_codigo_idx on public.spy_flag (codigo);
create index if not exists spy_flag_analise_idx on public.spy_flag (analise_id);

-- Dados sensíveis (PII financeira + inferências) → só admin por enquanto.
alter table public.spy_analise enable row level security;
alter table public.spy_flag    enable row level security;

drop policy if exists spy_analise_admin on public.spy_analise;
create policy spy_analise_admin on public.spy_analise for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

drop policy if exists spy_flag_admin on public.spy_flag;
create policy spy_flag_admin on public.spy_flag for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

create or replace function public.fn_spy_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_spy_touch on public.spy_analise;
create trigger trg_spy_touch before update on public.spy_analise
  for each row execute function public.fn_spy_touch();
