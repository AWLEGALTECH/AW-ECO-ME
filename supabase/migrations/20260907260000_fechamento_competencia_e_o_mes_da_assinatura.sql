-- O MÊS DE UM FECHAMENTO É O MÊS DA ASSINATURA. Ponto.
--
-- Valia outra coisa: tudo que fechasse até o 5º dia útil contava no mês
-- anterior, para dar uma janela de lançamento depois da virada. A regra tinha
-- uma lógica administrativa e um custo alto de leitura — no dia 3 de setembro,
-- um fechamento assinado naquele dia aparecia somando em agosto, e a tela
-- precisava de uma etiqueta ("conta em ago") explicando por que a data e o mês
-- não batiam. Todo relatório, toda conferência e toda conversa sobre o mês
-- começava desfazendo essa tradução.
--
-- A regra nova não tem exceção: assinou em setembro, é setembro. O que ela
-- custa é uma janela de lançamento; o que ela devolve é que "quantos fechamos
-- em agosto?" volta a ter uma resposta só, igual na tela, no SQL e na cabeça de
-- quem pergunta.
--
-- ⚠️ ISTO MOVE NÚMERO DE MÊS FECHADO. Sete assinaturas de 1 a 4 de setembro
-- estavam contando em agosto e passam para setembro: agosto sai de 51 para 44
-- fechamentos (de 127 para 111 rubricas) e setembro sai de zero para 7 (16
-- rubricas). É a mudança pedida, e não um efeito colateral — mas é bom que
-- esteja escrito, porque um mês já conferido muda de número por causa desta
-- linha.
create or replace function public.fn_competencia_fechamento(d date)
returns text
language sql
immutable
as $function$
  select to_char(date_trunc('month', d), 'YYYY-MM');
$function$;

comment on function public.fn_competencia_fechamento(date) is
  'O mes de um fechamento e o mes da assinatura. Sem excecao, sem virada por dia util.';

/* A coluna gerada é STORED: trocar a função NÃO recalcula o que já está
   gravado — os valores antigos ficariam lá, com a régua velha, e a mudança não
   apareceria em lugar nenhum. Derrubar e recriar a coluna recalcula tudo, e é
   seguro porque ela nunca teve valor próprio: sempre foi derivada da data. */
drop index if exists public.fechamentos_competencia_idx;
alter table public.fechamentos drop column competencia;
alter table public.fechamentos
  add column competencia text
  generated always as (public.fn_competencia_fechamento(data)) stored;
create index fechamentos_competencia_idx on public.fechamentos (competencia);

comment on column public.fechamentos.competencia is
  'O mes que conta: o da data da assinatura. Derivado, nunca escrito a mao.';

/* `fn_quinto_dia_util` fica de pé, sem chamador. Ela responde uma pergunta de
   calendário que continua verdadeira e que o escritório usa para outras coisas
   (prazo de pagamento, por exemplo); apagá-la junto seria jogar fora uma função
   correta por causa de uma regra que mudou. */
