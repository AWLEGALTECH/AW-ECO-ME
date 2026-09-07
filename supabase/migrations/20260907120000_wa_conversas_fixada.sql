-- FIXAR UMA CONVERSA NO TOPO DA CAIXA.
--
-- A fila se ordena sozinha pela última mensagem, e isso é o certo na maioria
-- esmagadora dos casos. Mas existe sempre um punhado de conversas que a pessoa
-- precisa ter debaixo do olho o dia inteiro — o caso que vai fechar hoje, o
-- cliente que ligou de manhã — e essas afundam justamente porque estão paradas:
-- quanto mais importante o assunto, mais tempo ele passa esperando uma decisão,
-- e mais fundo a conversa cai.
--
-- É um TIMESTAMP e não um booleano porque quem fixa várias precisa de ordem
-- entre elas, e a ordem que faz sentido é a de fixação: a última fixada em
-- cima, como uma pilha de papel na mesa.
alter table public.wa_conversas
  add column if not exists fixada_em timestamptz;

comment on column public.wa_conversas.fixada_em is
  'Quando alguem fixou a conversa no topo da caixa. Null = nao fixada. Timestamp e nao booleano pra dar ordem entre as fixadas.';

-- Índice parcial: a pergunta é sempre "quais estão fixadas", e as fixadas são
-- poucas por definição — um índice sobre a coluna inteira guardaria milhares de
-- nulos pra responder isso.
create index if not exists wa_conversas_fixadas
  on public.wa_conversas (instancia, fixada_em desc)
  where fixada_em is not null;
