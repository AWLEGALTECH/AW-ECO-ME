-- Módulo de Fechamentos & Comissões (controle da estagiária).
-- Espelha a planilha "ADRIA FECHAMENTOS": cada linha é um lead fechado, com
-- as rubricas/ações marcadas. A comissão = nº de ações × valor_acao + bônus
-- manual do mês.

create table if not exists public.fechamentos (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  cliente_nome text not null,
  cliente_id  uuid references public.clientes(id) on delete set null,
  -- lista de rubricas/ações fechadas (chaves do catálogo: RMC, CESTA, MORA…)
  rubricas    text[] not null default '{}',
  pendencia   boolean not null default false,
  pasta_drive boolean not null default false,  -- "SUBIU" na planilha
  responsavel text,                            -- estagiária (futuro multi)
  valor_acao  numeric(10,2) not null default 5,
  observacoes text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now()
);
create index if not exists fechamentos_data_idx on public.fechamentos (data);
create index if not exists fechamentos_cliente_idx on public.fechamentos (cliente_id);

-- Bônus/ajuste manual por mês (a coluna "COMISSÃO BÔNUS (SE HOUVER)").
create table if not exists public.fechamentos_meses (
  mes         text primary key,                 -- 'YYYY-MM'
  bonus       numeric(10,2) not null default 0,
  observacoes text,
  updated_at  timestamptz not null default now()
);

alter table public.fechamentos        enable row level security;
alter table public.fechamentos_meses  enable row level security;

drop policy if exists fechamentos_all on public.fechamentos;
create policy fechamentos_all on public.fechamentos
  for all to authenticated using (true) with check (true);

drop policy if exists fechamentos_meses_all on public.fechamentos_meses;
create policy fechamentos_meses_all on public.fechamentos_meses
  for all to authenticated using (true) with check (true);
