-- Cancelamento de protocolo
--
-- Uma peça pronta pra protocolo pode não ser mais ajuizada — cliente desistiu,
-- sumiu, ou a ação virou inviável. Antes disso não existia: a peça ficava
-- parada na coluna "Pronto pra protocolar" pra sempre.
--
-- O cancelamento reusa `status = 'cancelada'` (que a esteira e a regra de
-- reabertura de análise já respeitam) e guarda o PORQUÊ, que passa a aparecer
-- na ficha do cliente no lugar do "Protocolado".

alter table public.demandas
  add column if not exists cancelado_at timestamptz,
  add column if not exists cancelado_por uuid references auth.users(id) on delete set null,
  add column if not exists cancelamento_motivo text,
  add column if not exists cancelamento_detalhe text;

comment on column public.demandas.cancelado_at is
  'Quando o protocolo foi cancelado. Junto com status=cancelada, tira a peça da esteira.';
comment on column public.demandas.cancelamento_motivo is
  'Categoria do cancelamento: cliente_desistiu | cliente_nao_localizado | acao_inviavel | outro';
comment on column public.demandas.cancelamento_detalhe is
  'Texto livre. Obrigatório quando o motivo é "outro"; complementar nos demais.';

-- Consulta recorrente: "o que foi cancelado e por quê" (ficha do cliente e,
-- no futuro, um painel de perdas da esteira).
create index if not exists idx_demandas_cancelado_at
  on public.demandas (cancelado_at desc) where cancelado_at is not null;
