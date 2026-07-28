-- AW Tracker — controle de sentenças procedentes (o "pós-vitória").
-- Cada linha é uma ação GANHA que entra num funil até o dinheiro cair:
--   ganha → transitada → cumprimento → alvara → recebido
-- A sentença aponta pro processo já existente (numero_processo), então
-- cliente/matéria/comarca vêm por join — não duplicamos dados aqui.

create table if not exists public.sentencas (
  id               uuid primary key default gen_random_uuid(),
  processo_id      uuid references public.processos(id) on delete cascade,
  valor            numeric(12,2) not null default 0,   -- valor da condenação (o que o cliente ganha)
  data_sentenca    date not null,
  -- funil pós-vitória: ganha | transitada | cumprimento | alvara | recebido
  status           text not null default 'ganha',
  data_recebimento date,                                -- preenchida quando status = recebido
  honorarios       numeric(12,2),                       -- opcional: honorário do escritório
  observacoes      text,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now()
);

-- Uma sentença procedente por processo (evita duplicar a mesma vitória).
create unique index if not exists sentencas_processo_uidx
  on public.sentencas (processo_id) where processo_id is not null;
create index if not exists sentencas_status_idx on public.sentencas (status);
create index if not exists sentencas_data_idx on public.sentencas (data_sentenca);

alter table public.sentencas enable row level security;
drop policy if exists sentencas_all on public.sentencas;
create policy sentencas_all on public.sentencas
  for all to authenticated using (true) with check (true);

-- ── Seed: as 17 sentenças procedentes iniciais ──────────────────────────
-- Casadas pelo número do processo (comparado só pelos dígitos, ignorando
-- pontuação). Idempotente: on conflict no processo_id não duplica.
insert into public.sentencas (processo_id, valor, data_sentenca)
select p.id, d.valor, d.dt
from (values
  ('0602845-62.2023.8.04.0001', 11180.21, date '2026-06-11'),
  ('0176818-15.2026.8.04.1000',  2916.60, date '2026-07-23'),
  ('0005186-10.2026.8.04.5400',  6482.76, date '2026-07-07'),
  ('0164684-53.2026.8.04.1000', 10783.78, date '2026-07-08'),
  ('0000874-22.2026.8.04.2900',  2041.94, date '2026-07-24'),
  ('0163813-23.2026.8.04.1000',  3000.00, date '2026-07-21'),
  ('0162938-53.2026.8.04.1000',  7000.00, date '2026-07-04'),
  ('0005183-55.2026.8.04.5400',  2941.50, date '2026-07-13'),
  ('0152648-76.2026.8.04.1000',  4000.00, date '2026-07-13'),
  ('0000319-68.2026.8.04.2200', 12000.00, date '2026-07-17'),
  ('0135980-30.2026.8.04.1000',  3305.32, date '2026-06-23'),
  ('0122931-19.2026.8.04.1000',  9306.04, date '2026-07-13'),
  ('0086992-75.2026.8.04.1000',  4000.00, date '2026-05-11'),
  ('0084485-44.2026.8.04.1000',  4200.00, date '2026-05-21'),
  ('0060602-68.2026.8.04.1000', 10000.00, date '2026-06-11'),
  ('0032898-80.2026.8.04.1000',  5000.00, date '2026-05-08'),
  ('0015708-07.2026.8.04.1000',  5871.06, date '2026-04-30')
) as d(num, valor, dt)
join public.processos p
  on regexp_replace(p.numero_processo, '\D', '', 'g') = regexp_replace(d.num, '\D', '', 'g')
on conflict (processo_id) where processo_id is not null do nothing;

-- ── Acesso: por enquanto SÓ ADMIN ───────────────────────────────────────
-- Não concedemos 'tracker' a nenhum usuário: admin já enxerga todos os
-- módulos (RequireModule/AppSidebar liberam por isAdmin). Pra abrir pra
-- alguém depois, basta conceder o módulo pelo painel de Usuários.
