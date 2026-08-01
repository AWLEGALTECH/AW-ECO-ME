-- Excedentes de fechamento (bolsa de rubricas que passam pro mês seguinte).
--
-- Regra: quando "permitir excedentes" está DESLIGADO para uma pessoa num mês,
-- assim que ela bate a própria meta, as rubricas que passarem NÃO pagam nesse
-- mês — viram uma "bolsa de excedentes" (só a contagem, sem valor). Na virada
-- do mês, essa bolsa entra no mês seguinte como "excedente do mês anterior" e a
-- comissão é calculada pela REGRA DO NOVO MÊS. Tudo é derivado (calculado a
-- partir dos fechamentos + metas), então não há tabela de bolsa: só o flag.
--
-- Escopo do flag: GERAL do mês (default do time) + override POR PESSOA.
--   permitir_excedentes = true  -> paga tudo no mês (comportamento atual).
--   permitir_excedentes = false -> retém o que passar da meta (difere).
-- Na pessoa a coluna é NULA por padrão = "segue o geral do mês".

alter table public.fechamentos_meses
  add column if not exists permitir_excedentes boolean not null default true;

alter table public.fechamentos_metas
  add column if not exists permitir_excedentes boolean;  -- null = segue o geral

comment on column public.fechamentos_meses.permitir_excedentes is
  'Geral do mês: false retém rubricas acima da meta (viram bolsa de excedentes p/ o mês seguinte).';
comment on column public.fechamentos_metas.permitir_excedentes is
  'Override por pessoa: null segue o geral do mês; true/false força para a pessoa.';
