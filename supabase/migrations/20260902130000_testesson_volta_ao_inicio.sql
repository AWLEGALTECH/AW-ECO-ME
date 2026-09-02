-- TESTESSON PLAYGROUND volta pro começo.
--
-- O processo de teste tinha andado até "Cumprimento de sentença", com a
-- distribuição e a sentença marcadas como concluídas e um valor de execução de
-- R$ 100 pendurado na etapa — resíduo de quem estava exercitando o fluxo de
-- baixa. Nada disso é dado do escritório; é bancada de teste.
--
-- O QUE ESTA MIGRATION NÃO PRECISOU FAZER. A baixa nunca chegou a acontecer
-- neste processo: ele parou em AG. DECISÃO CS, e não há um único lançamento nem
-- repasse no Wallet apontando pra ele, pro cliente, nem com a descrição dele.
-- Conferido pelas três pontas (processo_id, cliente_id e descrição) antes de
-- escrever isto. As entradas de alvará que existem no Wallet são da
-- VANDERGLAUCIA, cliente real, e ficam onde estão.
--
-- O FILTRO É POR NOME E NÚMERO, não por id. Um id solto numa migration não diz
-- em que linha está mexendo, e "0000000-00.2026.8.04.0000" no cliente
-- "TESTESSON PLAYGROUND" não tem como ser um processo de verdade — se um dia a
-- linha não existir mais, a migration simplesmente não faz nada.
--
-- As tarefas voltam a ser lista vazia em todas as etapas: tarefa nasce quando a
-- etapa acontece, e nenhuma etapa aconteceu ainda. Manter tarefa de uma etapa
-- que voltou a ser "pendente" deixaria prazo de mentira no Tarefas e no
-- Dashboard.

update public.processos p
   set linha_temporal = (
         select jsonb_agg(
                  case
                    -- a primeira etapa passa a ser a atual, sem conclusão
                    when x.ord = 1 then
                      (x.e - 'conclusao' - 'execucao' - 'acordo' - 'valor' - 'prazo')
                      || jsonb_build_object(
                           'status',           'atual',
                           'inicio',           to_char(now() at time zone 'America/Manaus', 'DD/MM/YYYY'),
                           'statusProcessual', 'AG. DISTRIBUIÇÃO',
                           'tasks',            '[]'::jsonb)
                    -- todas as outras voltam a não ter acontecido
                    else
                      (x.e - 'conclusao' - 'execucao' - 'acordo' - 'valor' - 'prazo'
                           - 'inicio' - 'statusProcessual')
                      || jsonb_build_object(
                           'status', 'pendente',
                           'tasks',  '[]'::jsonb)
                  end
                  order by x.ord)
           from jsonb_array_elements(p.linha_temporal) with ordinality as x(e, ord)
       ),
       fase_processual = 'AG. DISTRIBUIÇÃO',
       updated_at      = now()
  from public.clientes c
 where c.id = p.cliente_id
   and c.nome = 'TESTESSON PLAYGROUND'
   and p.numero_processo = '0000000-00.2026.8.04.0000'
   and jsonb_typeof(p.linha_temporal) = 'array';
