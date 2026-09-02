-- TESTESSON PLAYGROUND, ZERADO DE NOVO — E DESSA VEZ POR LISTA BRANCA.
--
-- O QUE FALHOU NA VEZ PASSADA. Eu zerei a linha do tempo apagando uma LISTA DE
-- CAMPOS: conclusao, execucao, acordo, valor, prazo. A sentença ficou, porque
-- ela mora numa chave que não estava na minha lista (`sentenca`), e eu escrevi
-- a lista de cabeça em vez de perguntar ao banco quais existem. O processo
-- voltou pro começo com um "Procedente · R$ 100,00" pendurado na etapa 8.
--
-- Lista negra esquece; lista branca não tem como. O inventário de chaves da
-- linha do tempo, na base inteira, é:
--
--   estrutura ....... id, titulo, secao
--   estado .......... status, tasks, inicio, conclusao, statusProcessual
--   resultado ....... sentenca, execucao, julgamento, acordo
--
-- Agora a etapa é RECONSTRUÍDA a partir só das três de estrutura. Tudo que for
-- estado ou resultado some por não ter sido copiado — inclusive uma chave nova
-- que alguém invente depois desta migration.

-- ── 1. o dinheiro de teste sai do Wallet ────────────────────────────────────
-- Entrada de R$ 2,00 com repasse de R$ 1,00, nascida da baixa de teste. O
-- repasse vai junto por cascade (balance_repasses referencia o lançamento com
-- on delete cascade), e o trigger de auditoria registra a exclusão — o teste
-- some do caixa, mas fica no log de que foi apagado.
delete from public.balance_lancamentos l
 using public.processos p, public.clientes c
 where l.processo_id = p.id
   and c.id = p.cliente_id
   and c.nome = 'TESTESSON PLAYGROUND'
   and p.numero_processo = '0000000-00.2026.8.04.0000';

-- ── 2. a linha do tempo volta ao começo ─────────────────────────────────────
update public.processos p
   set linha_temporal = (
         select jsonb_agg(
                  -- só o esqueleto da etapa sobrevive
                  jsonb_build_object(
                    'id',     x.e->'id',
                    'titulo', x.e->'titulo',
                    'tasks',  '[]'::jsonb,
                    'status', case when x.ord = 1 then 'atual' else 'pendente' end)
                  -- `secao` é estrutura (agrupa Cumprimento e Acordo na tela),
                  -- então volta — mas só onde já existia
                  || case when x.e ? 'secao'
                          then jsonb_build_object('secao', x.e->'secao')
                          else '{}'::jsonb end
                  -- a primeira etapa é a atual, e é a única com data e status
                  || case when x.ord = 1
                          then jsonb_build_object(
                                 'inicio', to_char(now() at time zone 'America/Manaus', 'DD/MM/YYYY'),
                                 'statusProcessual', 'AG. DISTRIBUIÇÃO')
                          else '{}'::jsonb end
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
