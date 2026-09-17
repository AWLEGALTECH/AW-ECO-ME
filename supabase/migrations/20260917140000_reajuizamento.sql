-- REAJUIZAMENTO: A AÇÃO JULGADA SEM MÉRITO QUE VOLTA PARA A FILA DE PROTOCOLO.
--
-- Extinção sem mérito não encerra o direito: o mesmo pedido pode ser
-- protocolado de novo, com número novo, e vira um processo novo no fórum. Para
-- o sistema, porém, os dois são a mesma briga, e é isso que esta coluna guarda.
--
-- `reajuizamento_de` mora no processo NOVO e aponta para o ANTIGO. Nessa
-- direção porque é a que não mente quando a mesma ação cai duas vezes: o
-- antigo pode ter mais de um filho ao longo dos anos, o novo tem exatamente um
-- pai. Guardar do outro lado (um `reajuizado_em` no antigo) obrigaria a
-- escolher qual filho registrar.
--
-- `on delete set null` e não cascade: apagar o processo antigo não pode levar
-- junto o que está em juízo hoje. O novo perde o rastro da origem, o que é
-- ruim, mas é muito melhor do que perder a ação.
alter table public.processos
  add column if not exists reajuizamento_de uuid references public.processos(id) on delete set null;

comment on column public.processos.reajuizamento_de is
  'Processo de origem: esta ação é o reajuizamento daquela, que foi extinta sem mérito.';

-- Parcial porque a esmagadora maioria dos processos nunca foi reajuizada, e um
-- índice cheio de nulos custa escrita sem servir a leitura nenhuma.
create index if not exists idx_processos_reajuizamento_de
  on public.processos (reajuizamento_de)
  where reajuizamento_de is not null;

-- UM PROCESSO NÃO É REAJUIZAMENTO DE SI MESMO. Parece bobagem até alguém
-- duplicar uma ficha copiando os campos, inclusive o id de origem.
alter table public.processos
  drop constraint if exists processos_reajuizamento_nao_e_ele_mesmo;
alter table public.processos
  add constraint processos_reajuizamento_nao_e_ele_mesmo
  check (reajuizamento_de is null or reajuizamento_de <> id);
