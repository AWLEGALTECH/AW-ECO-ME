-- Análise comercial + princípio das rubricas não ajuizáveis.
-- A atendente comercial roda o Finder isolado, marca rubricas inviáveis
-- (cliente não quer / já ajuizada) e salva uma "análise comercial". Essas
-- infos (nome + rubricas com flags de bloqueio) viram base pro Writer
-- (prefill) e pra análise primária do advogado.

create table if not exists public.analises_comerciais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf_cnpj text,
  -- cada item de rubricas: { "rubrica": text, "valor": number|null,
  --   "bloqueada": bool, "motivo": "cliente_nao_quer"|"ja_ajuizada"|null }
  rubricas jsonb not null default '[]'::jsonb,
  planilha_url text,
  drive_folder_url text,
  cliente_id uuid references public.clientes(id) on delete set null,
  origem text not null default 'finder',
  status text not null default 'aberta',  -- aberta | usada | arquivada
  observacoes text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_analises_comerciais_cliente on public.analises_comerciais(cliente_id);
create index if not exists idx_analises_comerciais_status  on public.analises_comerciais(status);
create index if not exists idx_analises_comerciais_created  on public.analises_comerciais(created_at desc);

alter table public.analises_comerciais enable row level security;

create policy analises_comerciais_auth_all on public.analises_comerciais
  for all to authenticated using (true) with check (true);
create policy analises_comerciais_anon_insert on public.analises_comerciais
  for insert to anon with check (origem = 'finder');
create policy analises_comerciais_anon_select on public.analises_comerciais
  for select to anon using (true);
create policy analises_comerciais_anon_update on public.analises_comerciais
  for update to anon using (true) with check (true);

create or replace function public.touch_analises_comerciais_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_analises_comerciais_updated on public.analises_comerciais;
create trigger trg_analises_comerciais_updated before update on public.analises_comerciais
  for each row execute function public.touch_analises_comerciais_updated_at();

-- Rubricas bloqueadas carregadas no cliente (copiadas da análise comercial no
-- atrelamento/conversão). Cada item: { "rubrica": text, "motivo": text }.
alter table public.clientes
  add column if not exists rubricas_bloqueadas jsonb not null default '[]'::jsonb;

comment on table public.analises_comerciais is 'Análise comercial pré-produção: nome do cliente + rubricas com flags de inviabilidade de ajuizamento (cliente não quer / já ajuizada). Gerada no Finder isolado, consumida pelo Writer e pela análise primária.';
comment on column public.clientes.rubricas_bloqueadas is 'Rubricas sinalizadas como não ajuizáveis (princípio das rubricas não ajuizáveis), copiadas da análise comercial. Cada item: {rubrica, motivo}.';
