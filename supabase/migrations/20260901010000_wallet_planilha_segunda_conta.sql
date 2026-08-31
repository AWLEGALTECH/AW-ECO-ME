-- O que a planilha tinha e o extrato não: entra numa segunda conta.
--
-- Comparando a planilha FLUXO FINANCEIRO com o extrato da Caixa, treze
-- lançamentos existem só na planilha — tráfego, aluguel de 524, garrafão,
-- tapioca, gpt, sala pro office, domínio, mercado, a retirada do Matheus de
-- 1.500 e as entradas do Marcos e do Kelvin. Nenhum deles passou pela conta da
-- Caixa em agosto: o extrato não os tem, e o extrato bate no centavo com o
-- saldo do banco.
--
-- O escritório confirmou: esse dinheiro passou por OUTRA CONTA, e o "Caixa mês
-- julho" de R$ 10.748,77 é saldo real que veio de julho, não número de ajuste.
-- Então ele vira o saldo inicial dessa segunda conta.
--
-- CONTA É ETIQUETA, NÃO GAVETA — a regra do Wallet continua valendo. O saldo
-- do escritório passa a ser a soma das duas, e cada lançamento diz por onde
-- passou. A da Caixa segue fechando em R$ 22.180,76 contra o extrato; esta
-- fecha em R$ 8.826,77 (10.748,77 + 900,00 − 2.822,00). Total: R$ 31.007,53.
--
-- A CONTA NASCE SEM NOME DE BANCO de propósito. O escritório disse "outra
-- conta ou cartão" mas não disse qual — inventar um banco aqui seria pôr a
-- marca errada em cima de dinheiro de verdade. Fica "Outra conta", com o ícone
-- genérico, pra ser renomeada no lápis da aba Contas.
--
-- AS DATAS SÃO AS DA PLANILHA. Onze dos treze estão lá como 01/08, que tem
-- cara de data padrão de digitação e não de dia real do gasto. Mantive o que
-- está escrito em vez de espalhar por chute; corrigir uma a uma é trabalho de
-- quem sabe o dia.
--
-- Idempotente: apaga o que ela mesma criou antes de criar de novo.

insert into public.balance_contas (nome, tipo, instituicao, banco, saldo_inicial, ordem, ativo)
select 'Outra conta', 'corrente', null, null, 10748.77, 20, true
 where not exists (select 1 from public.balance_contas where nome = 'Outra conta');

update public.balance_contas
   set saldo_inicial = 10748.77, updated_at = now()
 where nome = 'Outra conta';

delete from public.balance_lancamentos where origem_ref like 'planilha-2026-08%';

with conta as (select id from public.balance_contas where nome = 'Outra conta' limit 1),
mov(ref, dia, tipo, valor, descricao, categoria, obs) as (values
  ('01','2026-08-15'::date,'entrada', 500.00, 'Cliente Marcos',        'Honorário contratual',   'Da planilha. Há três clientes "Marcos" cadastrados — não dá pra saber qual sem perguntar, então não amarrei em nenhum.'),
  ('02','2026-08-15'::date,'entrada', 400.00, 'Cliente Kelvin',        'Honorário contratual',   'Da planilha.'),
  ('03','2026-08-01'::date,'saida',  1500.00, 'Retirada Matheus',      'Pró-labore',             'Da planilha. Data 01/08 é a que está lá.'),
  ('04','2026-08-01'::date,'saida',   524.00, 'Aluguel',               'Aluguel',                'CONFERIR: a planilha diz R$ 524,00 e o custo fixo cadastrado é R$ 786,00. Um dos dois está desatualizado.'),
  ('05','2026-08-01'::date,'saida',   100.00, 'Tráfego',               'Marketing e tráfego',    'Da planilha.'),
  ('06','2026-08-01'::date,'saida',   100.00, 'Tráfego',               'Marketing e tráfego',    'Da planilha.'),
  ('07','2026-08-01'::date,'saida',   115.00, 'Tráfego',               'Marketing e tráfego',    'Da planilha.'),
  ('08','2026-08-01'::date,'saida',   100.00, 'Tráfego',               'Marketing e tráfego',    'Da planilha.'),
  ('09','2026-08-01'::date,'saida',   185.00, 'Sala Pro Office',       'Software e assinaturas', 'Da planilha.'),
  ('10','2026-08-01'::date,'saida',    78.00, 'Mercado',               'Alimentação e copa',     'Da planilha.'),
  ('11','2026-08-01'::date,'saida',    30.00, 'Domínio',               'Software e assinaturas', 'Da planilha.'),
  ('12','2026-08-01'::date,'saida',    26.00, 'GPT peças',             'Software e assinaturas', 'Da planilha.'),
  ('13','2026-08-01'::date,'saida',    12.00, 'Garrafão',              'Alimentação e copa',     'Da planilha.'),
  ('14','2026-08-01'::date,'saida',    12.00, 'Garrafão',              'Alimentação e copa',     'Da planilha.'),
  ('15','2026-08-01'::date,'saida',    40.00, 'Tapioca · reunião Meta','Alimentação e copa',     'Da planilha.')
)
insert into public.balance_lancamentos
  (conta_id, categoria_id, tipo, valor, data, status, descricao, observacoes,
   origem, origem_ref, pago_em)
select (select id from conta), cat.id, m.tipo, m.valor, m.dia, 'realizado',
       m.descricao, m.obs, 'manual', 'planilha-2026-08|' || m.ref, m.dia::timestamptz
  from mov m
  left join public.balance_categorias cat
         on cat.nome = m.categoria and cat.tipo = m.tipo;
