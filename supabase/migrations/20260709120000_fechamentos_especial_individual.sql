-- Faixa especial INDIVIDUAL por voluntário.
-- Antes a faixa especial (base vale até X descontos; acima disso vale o valor
-- especial) só existia no nível do mês (fechamentos_meses), aplicada a todos.
-- Agora cada pessoa pode ter a própria faixa especial, sobrepondo a geral —
-- pra controlar comissão especial de um funcionário específico.
--
-- Resolução por pessoa: se a pessoa tem faixa especial própria ativa, usa a
-- dela; senão, cai na faixa especial geral do mês (se ativa).

alter table public.fechamentos_metas
  add column if not exists especial_ativo   boolean not null default false,
  add column if not exists valor_especial   numeric(10,2) not null default 0,
  add column if not exists especial_limite   int;  -- base vale ATÉ X; acima, valor_especial
