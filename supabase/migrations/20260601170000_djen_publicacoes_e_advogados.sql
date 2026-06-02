-- DJEN (Diario de Justica Eletronico Nacional / CNJ) integration.
--
-- advogados_djen: quem o sistema monitora. Suporta multiplos
-- advogados (Matheus + Diego) com flag ativo.
create table if not exists public.advogados_djen (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  oab         text not null,
  uf          text not null check (char_length(uf) = 2),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (oab, uf)
);

comment on table public.advogados_djen is
  'Advogados monitorados pelo sync do DJEN/CNJ. Um por OAB+UF.';

-- publicacoes: cada publicacao retornada pela API do DJEN.
create table if not exists public.publicacoes (
  id                 uuid primary key default gen_random_uuid(),
  advogado_id        uuid references public.advogados_djen(id) on delete set null,
  -- chave externa do DJEN (id da comunicacao). Usada pra deduplicar
  -- entre rodadas do cron job.
  djen_id            text unique,
  numero_processo    text,
  tribunal           text,
  orgao              text,
  data_disponibilizacao  date,
  data_publicacao    date,
  tipo_documento     text,
  conteudo           text,
  link_origem        text,
  status_leitura     text not null default 'nao_lida'
                       check (status_leitura in ('nao_lida','lida','arquivada')),
  lido_em            timestamptz,
  lido_por           uuid,
  created_at         timestamptz not null default now()
);

comment on table public.publicacoes is
  'Publicacoes do DJEN endereçadas aos advogados monitorados. Trigger pro prazo.';

create index if not exists idx_publicacoes_status      on public.publicacoes(status_leitura);
create index if not exists idx_publicacoes_data        on public.publicacoes(data_disponibilizacao desc);
create index if not exists idx_publicacoes_processo    on public.publicacoes(numero_processo);
create index if not exists idx_publicacoes_advogado    on public.publicacoes(advogado_id);

alter table public.advogados_djen enable row level security;
alter table public.publicacoes   enable row level security;

create policy advogados_djen_read on public.advogados_djen
  for select using (auth.role() = 'authenticated');
create policy publicacoes_read on public.publicacoes
  for select using (auth.role() = 'authenticated');

create policy publicacoes_update_leitura on public.publicacoes
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
