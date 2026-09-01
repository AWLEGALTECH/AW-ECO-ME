-- VALOR EXCEPCIONAL: um valor por rubrica decidido pra uma pessoa, num mês.
--
-- Já existe a faixa especial, mas ela é outra coisa: funciona em DEGRAU — a
-- rubrica vale o base até certo volume e passa a valer mais depois disso. É
-- mérito por quantidade, e depende da pessoa produzir.
--
-- O excepcional não depende de volume nenhum. É a direção decidindo que, neste
-- mês, a rubrica daquela pessoa vale outro valor, do início ao fim, pelo motivo
-- que ela escrever. São dois instrumentos com propósitos diferentes, então são
-- dois campos — reaproveitar a faixa especial pra isso obrigaria a inventar um
-- limite falso (zero) e o histórico ficaria sem saber qual dos dois foi usado.
--
-- A OBSERVAÇÃO NÃO É ENFEITE. Um valor diferente do combinado, sem registro do
-- porquê, é o tipo de coisa que ninguém consegue explicar três meses depois —
-- nem pra quem recebeu, nem pra quem não recebeu. Por isso ela viaja junto do
-- valor, no mesmo registro do mesmo mês, e a tela mostra as duas coisas lado a
-- lado.
--
-- PRECEDÊNCIA: excepcional > faixa especial própria > faixa especial geral. O
-- excepcional é decisão explícita e manual; ele ganha de qualquer regra
-- automática.

alter table public.fechamentos_metas
  add column if not exists excepcional_ativo boolean not null default false,
  add column if not exists excepcional_valor numeric(12,2),
  add column if not exists excepcional_obs   text;

comment on column public.fechamentos_metas.excepcional_ativo is
  'Ligado, a rubrica desta pessoa neste mês vale excepcional_valor do início ao fim, sem degrau. Sobrepõe a faixa especial própria e a geral.';
comment on column public.fechamentos_metas.excepcional_valor is
  'R$ por rubrica válida enquanto o excepcional estiver ligado.';
comment on column public.fechamentos_metas.excepcional_obs is
  'Por que este valor foi atribuído a esta pessoa neste mês. Sem isso, ninguém explica a diferença três meses depois.';
