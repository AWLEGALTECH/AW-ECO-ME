-- A ETAPA "reajuizamento" PRECISA ENTRAR NA LISTA FECHADA DE `demandas.etapa`.
--
-- Sem isto o INSERT morria no CHECK, com "new row for relation demandas
-- violates check constraint demandas_etapa_check" chegando na tela como um
-- toast de erro, e o botão de gerar a demanda não funcionava para ninguém.
--
-- A lista fechada é boa e fica: etapa é o que decide em qual coluna do quadro a
-- demanda aparece, e uma etapa escrita errada some da esteira sem erro nenhum,
-- que é o pior jeito de uma demanda se perder. O que faltou foi acrescentar a
-- nova quando ela nasceu.
alter table public.demandas drop constraint if exists demandas_etapa_check;

alter table public.demandas add constraint demandas_etapa_check check (
  etapa = any (array[
    'analise_documental',
    'analise_vinculada',
    'fluxo_artesanal',
    'confeccao_peca',
    'pronta_para_protocolo',
    'protocolada',
    'processual',
    'pendencia_documental',
    -- A ação extinta sem mérito, voltando para o protocolo com número novo.
    'reajuizamento'
  ])
);
