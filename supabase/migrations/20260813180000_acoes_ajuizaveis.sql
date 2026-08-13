-- Catálogo GLOBAL de ações ajuizáveis (antes "descontos"): a lista fixa de
-- cards que todo mundo vê. Antes era hard-coded em dois lugares (writer-app e
-- editor da análise comercial); agora mora aqui e qualquer usuário pode
-- acrescentar uma ação padrão, que passa a valer para todos.
create table if not exists public.acoes_ajuizaveis (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int not null default 100,
  ativo boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists acoes_ajuizaveis_nome_idx on public.acoes_ajuizaveis (lower(trim(nome)));

alter table public.acoes_ajuizaveis enable row level security;
drop policy if exists acoes_ajuizaveis_select on public.acoes_ajuizaveis;
create policy acoes_ajuizaveis_select on public.acoes_ajuizaveis for select to authenticated using (true);
drop policy if exists acoes_ajuizaveis_insert on public.acoes_ajuizaveis;
create policy acoes_ajuizaveis_insert on public.acoes_ajuizaveis for insert to authenticated with check (true);
drop policy if exists acoes_ajuizaveis_update on public.acoes_ajuizaveis;
create policy acoes_ajuizaveis_update on public.acoes_ajuizaveis for update to authenticated using (true) with check (true);
drop policy if exists acoes_ajuizaveis_anon_select on public.acoes_ajuizaveis;
create policy acoes_ajuizaveis_anon_select on public.acoes_ajuizaveis for select to anon using (true);

insert into public.acoes_ajuizaveis (nome, ordem) values
  ('RMC - Reserva de Margem Consignável', 10),
  ('RCC - Reserva de Cartão de Crédito', 20),
  ('Cesta de tarifas', 30),
  ('Mora', 40),
  ('Juros abusivos', 50),
  ('SVA', 60),
  ('Título de capitalização', 70),
  ('Gasto com cartão de crédito', 80),
  ('Cobrança indevida', 90),
  ('Vida / Previdência', 100),
  ('Seguro', 110),
  ('Anuidade', 120),
  ('Baixa antecipada de financiamento', 130),
  ('Parcela de crédito pessoal', 140),
  ('Emissão de extrato', 150),
  ('Saque em terminal', 160),
  ('Adicional do depositante', 170),
  ('Refinanciamento indevido', 180),
  ('Reorganização financeira', 190),
  ('Encargos por descoberto', 200),
  ('Encargos em excesso', 210)
on conflict do nothing;
