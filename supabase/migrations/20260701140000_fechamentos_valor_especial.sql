-- Faixa especial de valor por ação (liga/desliga por mês).
-- Correção do modelo: "valor base" e "multiplicador base" eram a mesma coisa
-- (R$ por ação). O especial não é um fator, é OUTRO valor por ação que passa a
-- valer depois de um limite de ações.
--   valor_base     = R$/ação na faixa base (ex.: 5).
--   valor_especial = R$/ação depois do limite (ex.: 6).
--   especial_ativo = admin liga/desliga a faixa especial naquele mês.
--   mult_especial_min = "base vale ATÉ X ações"; acima disso vale o especial.
-- Comissão = ações × valor_por_ação_vigente + bônus (o multiplicador é individual).
alter table public.fechamentos_meses
  add column if not exists valor_especial numeric(10,2) not null default 0,
  add column if not exists especial_ativo  boolean       not null default false;
