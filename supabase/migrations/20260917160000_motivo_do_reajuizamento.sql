-- POR QUE ESTA AÇÃO CAIU.
--
-- O reajuizamento tem sempre uma causa, e ela é a informação mais cara do par:
-- é o que não pode se repetir no reprotocolo. Estava indo só na descrição da
-- demanda, que vive na esteira e some de vista assim que a peça é protocolada.
-- Quem abrisse a ficha seis meses depois veria "foi reajuizado" e não saberia
-- por quê.
--
-- Mora no processo ANTIGO, que é onde o motivo aconteceu. O processo novo lê o
-- do pai pelo vínculo `reajuizamento_de`, e não guarda cópia: cópia envelhece,
-- e a correção feita num lado não chegaria no outro.
alter table public.processos
  add column if not exists reajuizamento_motivo text;

comment on column public.processos.reajuizamento_motivo is
  'Por que esta ação foi extinta e precisou voltar. Texto livre ou o resumo das pendências que travaram o reprotocolo.';
