-- A PLANILHA É A FONTE. Ordem do escritório: a planilha FLUXO FINANCEIRO foi
-- revisada pelo Dr. Matheus e o valor dela é o fidedigno. Nada de somar duas
-- contas pra chegar num total maior — o valor final é o da planilha,
-- R$ 22.180,76.
--
-- O Wallet estava montado sobre o extrato da Caixa, e os dois discordam. Esta
-- migration desfaz esse desenho e deixa o Wallet ser a planilha:
--
--   1. Volta pra UMA conta. A "Outra conta" some e os quinze lançamentos que
--      estavam nela voltam pra Caixa — eles estão na planilha, e é a planilha
--      que manda.
--   2. O "Caixa mês julho" de R$ 10.748,77 vira o saldo inicial da conta, não
--      um lançamento: ele é saldo de partida, não movimento de agosto.
--   3. Saem os dezenove lançamentos que só o extrato tinha e a planilha não
--      registra. Isso inclui coisa grande — os dois Pix do Dr. Matheus, de
--      R$ 8.676,77 e R$ 4.934,18 — e as duas saídas de R$ 1.735,00 e
--      R$ 2.250,00 pra ele. Sem tirá-los o total não fecha na planilha.
--   4. Três valores voltam pro que a planilha diz.
--
-- O QUE ISSO RESOLVE DE BONITO: os repasses da ROSIMEIRY e da OLGAIDE eu tinha
-- marcado como divergentes porque o banco mostrava R$ 1.663,56 pras duas. A
-- planilha diz R$ 1.514,00 e R$ 1.250,00 — que são 50% exatos dos respectivos
-- recebimentos. Com a planilha valendo, oito dos nove repasses de agosto
-- fecham redondo em 50%, 60% ou 70%. Só o da NICOLY continua fora, em 65%.
--
-- Conferência: entradas 42.807,20 + saldo inicial 10.748,77 − saídas 31.375,21
-- = 22.180,76, e os totais batem com a aba Resumo da planilha (entradas
-- 53.555,97 contando o caixa de julho, saídas 31.375,21).

-- ── 1. os valores voltam pro que a planilha diz ─────────────────────────────
update public.balance_lancamentos set valor = 1514.00,
       observacoes = '50% do levantamento de R$ 3.027,99, conforme a planilha revisada.'
 where origem_ref = 'extrato-2026-08|21';

update public.balance_lancamentos set valor = 1250.00,
       observacoes = '50% do acordo de R$ 2.500,00, conforme a planilha revisada.'
 where origem_ref = 'extrato-2026-08|28';

update public.balance_lancamentos set valor = 73.00
 where origem_ref = 'extrato-2026-08|16';

-- os repasses acompanham
update public.balance_repasses r set valor_devido = l.valor,
       observacoes = 'Contrato de 50%, conforme a planilha revisada.', updated_at = now()
  from public.balance_lancamentos l
 where l.id = r.lancamento_saida_id
   and l.origem_ref in ('extrato-2026-08|21', 'extrato-2026-08|28');

-- ── 2. a retirada do Diego se separa da cadeira ─────────────────────────────
-- Na planilha são duas linhas: retirada 4.000,00 e parcela da cadeira 195,03.
-- Juntas num pix só elas jogavam móvel dentro de pró-labore.
update public.balance_lancamentos set valor = 4000.00,
       descricao = 'Retirada Diego',
       observacoes = 'Saiu num pix só com a parcela da cadeira; separado conforme a planilha.'
 where origem_ref = 'extrato-2026-08|36';

insert into public.balance_lancamentos
  (conta_id, categoria_id, tipo, valor, data, status, descricao, observacoes, origem, origem_ref, pago_em)
select l.conta_id,
       (select id from public.balance_categorias where nome = 'Material e manutenção' and tipo = 'saida'),
       'saida', 195.03, l.data, 'realizado', 'Parcela da cadeira',
       'Saiu junto com a retirada do Diego no mesmo pix.', 'manual', 'extrato-2026-08|36b', l.pago_em
  from public.balance_lancamentos l
 where l.origem_ref = 'extrato-2026-08|36'
   and not exists (select 1 from public.balance_lancamentos x where x.origem_ref = 'extrato-2026-08|36b');

-- ── 3. saem os que só o extrato tinha ───────────────────────────────────────
delete from public.balance_lancamentos
 where origem_ref in (
   -- entradas que a planilha não registra
   'extrato-2026-08|08',  -- Pix Dr. Matheus        8.676,77
   'extrato-2026-08|39',  -- Pix Dr. Matheus        4.934,18
   'extrato-2026-08|26',  -- reembolso Diego          413,56
   'extrato-2026-08|22',  -- Bemol                    125,20
   'extrato-2026-08|23',  -- Bemol                      0,01
   'extrato-2026-08|34',  -- Carmelino                 10,00
   -- saídas que a planilha não registra
   'extrato-2026-08|04',  -- Dr. Matheus            1.735,00
   'extrato-2026-08|06',  -- Dr. Matheus            2.250,00
   'extrato-2026-08|10',  -- Sync Pay                  17,52
   'extrato-2026-08|11',  -- Daniel                   130,00
   'extrato-2026-08|12',  -- Tatiana                   34,00
   'extrato-2026-08|13',  -- Taynna                    30,00
   'extrato-2026-08|17',  -- Alacy                     33,00
   'extrato-2026-08|18',  -- Wellington                33,00
   'extrato-2026-08|19',  -- Loja Charme Modas         80,00
   'extrato-2026-08|27',  -- Pagar.me                  28,30
   'extrato-2026-08|31',  -- Pix Marketplace           34,87
   'extrato-2026-08|40',  -- Pagar.me                 297,00
   'extrato-2026-08|41'   -- Kiwify                    67,00
 );

-- ── 4. volta a ser uma conta só ─────────────────────────────────────────────
update public.balance_lancamentos
   set conta_id = (select id from public.balance_contas where banco = 'caixa' limit 1)
 where origem_ref like 'planilha-2026-08%';

delete from public.balance_contas where nome = 'Outra conta';

-- o caixa que veio de julho é saldo de partida, não movimento de agosto
update public.balance_contas
   set saldo_inicial = 10748.77, updated_at = now()
 where banco = 'caixa';
