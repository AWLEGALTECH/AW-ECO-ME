-- BALANCE — carga do extrato real de agosto/2026.
--
-- Sai o que foi teste, entra o que o banco mostra. Fonte: extrato por período
-- de 11/08 a 31/08/2026 (Saldo Anterior R$ 0,00 → Saldo do dia R$ 22.180,76),
-- conferido linha a linha contra a planilha FLUXO FINANCEIRO ESCRITÓRIO.
--
-- Onde os dois discordam, vale o EXTRATO — a planilha é digitada à mão e tem
-- dois valores de repasse que o banco desmente (ver observações abaixo).
--
-- O QUE ESTA MIGRATION NÃO FAZ: não inventa percentual de contrato. Os
-- repasses só nascem com o valor que de fato saiu da conta; onde o percentual
-- não fecha em 50/60/70, isso vai escrito na observação em vez de ser
-- "arredondado" pra fechar.
--
-- Idempotente: tudo que ela cria carrega origem_ref começando em
-- 'extrato-2026-08', e ela apaga isso antes de inserir de novo.

-- ── categorias que faltavam pro extrato caber ───────────────────────────────
insert into public.balance_categorias (nome, tipo, grupo, fixa, ordem, icone, judicial) values
  ('Material e manutenção', 'saida', 'Estrutura', false, 65, 'Hammer', false),
  ('Alimentação e copa',    'saida', 'Estrutura', false, 66, 'Coffee', false)
on conflict (nome, tipo) do nothing;

-- ── limpeza: os lançamentos de teste e qualquer carga anterior deste extrato ─
delete from public.balance_lancamentos
 where descricao ilike 'teste%'
    or descricao ilike '%teste de repasse%'
    or origem_ref like 'extrato-2026-08%';

-- A conta é a mesma do extrato e ela começou zerada em 11/08: o extrato diz
-- "Saldo Anterior R$ 0,00". O R$ 10.000 que estava aqui era do teste.
update public.balance_contas
   set saldo_inicial = 0,
       instituicao   = coalesce(instituicao, 'Conta do escritório'),
       updated_at    = now()
 where nome = 'Conta Principal';

-- ── os 45 lançamentos do extrato ────────────────────────────────────────────
with conta as (
  select id from public.balance_contas where nome = 'Conta Principal' limit 1
),
mov(ref, dia, tipo, valor, descricao, categoria, processo, obs) as (values
  -- 11/08
  ('01','2026-08-11'::date,'entrada', 3470.00, 'Recebimento TED · Jurídico Matriz',                     'Alvará recebido',       '0086992-75.2026.8.04.1000', null),
  ('02','2026-08-11'::date,'saida',   1735.00, 'Repasse · Mylena Lopes',                                'Repasse ao cliente',    '0086992-75.2026.8.04.1000', '50% do levantamento de R$ 3.470,00.'),
  -- 14/08
  ('03','2026-08-14'::date,'entrada', 4500.00, 'Recebimento TED · Banco Pan S.A.',                      'Acordo recebido',       '0000938-46.2026.8.04.4900', null),
  ('04','2026-08-14'::date,'saida',   1735.00, 'Pró-labore · Matheus Ferreira Enes',                    'Pró-labore',            null, 'Espelha o repasse da Mylena: metade do escritório no processo 0086992-75.'),
  -- 17/08
  ('05','2026-08-17'::date,'saida',   2250.00, 'Repasse · Albaniza Soares dos Santos',                  'Repasse ao cliente',    '0000938-46.2026.8.04.4900', '50% do acordo de R$ 4.500,00.'),
  ('06','2026-08-17'::date,'saida',   2250.00, 'Pró-labore · Matheus Ferreira Enes',                    'Pró-labore',            null, 'A outra metade do acordo 0000938-46.'),
  -- 18/08
  ('07','2026-08-18'::date,'entrada',10000.00, 'Recebimento TED · Jurídico Matriz',                     'Acordo recebido',       '0164684-53.2026.8.04.1000', null),
  ('08','2026-08-18'::date,'entrada', 8676.77, 'Pix recebido · Matheus Ferreira Enes (58.552.184)',     'Aporte de sócio',       null, null),
  ('09','2026-08-18'::date,'saida',   5000.00, 'Repasse · Marta Picanço da Silva',                      'Repasse ao cliente',    '0164684-53.2026.8.04.1000', '50% do acordo de R$ 10.000,00.'),
  ('10','2026-08-18'::date,'saida',     17.52, 'Sync Pay',                                              'Outras despesas',       null, null),
  ('11','2026-08-18'::date,'saida',    130.00, 'Pix · Daniel de Melo Rodrigues',                        'Outras despesas',       null, null),
  ('12','2026-08-18'::date,'saida',     34.00, 'Pix · Tatiana Souza Cruz Melo de Arruda',               'Alimentação e copa',    null, null),
  ('13','2026-08-18'::date,'saida',     30.00, 'Pix · Taynna Raiza Costa Lima',                         'Outras despesas',       null, null),
  -- 20/08
  ('14','2026-08-20'::date,'entrada', 3027.99, 'Crédito de levantamento · ordem eletrônica',            'Alvará recebido',       '0163813-23.2026.8.04.1000', null),
  ('15','2026-08-20'::date,'entrada', 3327.13, 'Crédito de levantamento · ordem eletrônica',            'Alvará recebido',       '0135980-30.2026.8.04.1000', null),
  ('16','2026-08-20'::date,'saida',     73.14, 'Supermercados DB',                                      'Alimentação e copa',    null, null),
  ('17','2026-08-20'::date,'saida',     33.00, 'Pix · Alacy Lopes de Jesus Ferreira',                   'Alimentação e copa',    null, null),
  ('18','2026-08-20'::date,'saida',     33.00, 'Pix · Wellington Butel Santana',                        'Outras despesas',       null, null),
  ('19','2026-08-20'::date,'saida',     80.00, 'Loja Charme Modas',                                     'Outras despesas',       null, null),
  -- 21/08
  ('20','2026-08-21'::date,'entrada', 2500.00, 'Recebimento TED · Jurídico Matriz',                     'Acordo recebido',       '0176818-15.2026.8.04.1000', null),
  ('21','2026-08-21'::date,'saida',   1663.56, 'Repasse · Rosimeiry Ferreira dos Santos',               'Repasse ao cliente',    '0163813-23.2026.8.04.1000', 'CONFERIR: 50% do levantamento de R$ 3.027,99 daria R$ 1.514,00 — que é o valor na planilha. Saiu R$ 1.663,56, R$ 149,56 a mais.'),
  -- 24/08
  ('22','2026-08-24'::date,'entrada',  125.20, 'Pix recebido · Bemol S.A.',                             'Reembolso',             null, null),
  ('23','2026-08-24'::date,'entrada',    0.01, 'Pix recebido · Bemol Serviços Financeiros',             'Reembolso',             null, null),
  ('24','2026-08-24'::date,'saida',    184.00, 'Shopee · trilho de luz',                                'Material e manutenção', null, null),
  ('25','2026-08-24'::date,'saida',    100.00, 'Tráfego · Luan Ásaf Lima Fernandes',                    'Marketing e tráfego',   null, null),
  -- 25/08
  ('26','2026-08-25'::date,'entrada',  413.56, 'Pix recebido · Diego da Gama Ismael',                   'Reembolso',             null, 'Bate exatamente com o excedente do repasse da Olgaide no mesmo dia (R$ 1.663,56 − R$ 1.250,00).'),
  ('27','2026-08-25'::date,'saida',     28.30, 'Pagar.me',                                              'Software e assinaturas',null, null),
  ('28','2026-08-25'::date,'saida',   1663.56, 'Repasse · Olgaide Souza de Almeida Gomes',              'Repasse ao cliente',    '0176818-15.2026.8.04.1000', 'CONFERIR: 50% do acordo de R$ 2.500,00 daria R$ 1.250,00 — que é o valor na planilha. Saiu R$ 1.663,56; o Diego devolveu os R$ 413,56 de diferença no mesmo dia.'),
  -- 26/08
  ('29','2026-08-26'::date,'saida',    250.00, 'Tráfego empresarial · Luan Ásaf Lima Fernandes',        'Marketing e tráfego',   null, null),
  -- 27/08
  ('30','2026-08-27'::date,'entrada', 9533.67, 'Crédito de levantamento · ordem eletrônica',            'Alvará recebido',       '0122931-19.2026.8.04.1000', null),
  ('31','2026-08-27'::date,'saida',     34.87, 'Pix Marketplace',                                       'Outras despesas',       null, null),
  -- 28/08
  ('32','2026-08-28'::date,'entrada', 4048.41, 'Crédito de levantamento · ordem eletrônica',            'Alvará recebido',       '0152648-76.2026.8.04.1000', null),
  ('33','2026-08-28'::date,'entrada', 1500.00, 'Pix recebido · Carmelino Frasson',                      'Acordo recebido',       '0123276-82.2026.8.04.1000', 'DEFINIR O REPASSE: nada saiu pra cliente em agosto e o percentual do contrato não está registrado.'),
  ('34','2026-08-28'::date,'entrada',   10.00, 'Pix recebido · Carmelino Frasson',                      'Reembolso',             null, null),
  ('35','2026-08-28'::date,'saida',   1663.56, 'Repasse · Miracelva Xavier da Silva',                   'Repasse ao cliente',    '0135980-30.2026.8.04.1000', '50% do levantamento de R$ 3.327,13 (1 centavo de arredondamento).'),
  ('36','2026-08-28'::date,'saida',   4195.03, 'Pró-labore · Diego da Gama Ismael',                     'Pró-labore',            null, 'Retirada R$ 4.000,00 + parcela da cadeira R$ 195,03, num pix só.'),
  ('37','2026-08-28'::date,'saida',    975.00, 'Repasse · Maria Fabrícia Moreira de Aguiar',            'Repasse ao cliente',    null, 'CONFERIR: não há entrada em agosto que case com este repasse, e ela não está cadastrada como cliente.'),
  ('38','2026-08-28'::date,'saida',   6673.57, 'Repasse · Darlene Andrade Monteiro',                    'Repasse ao cliente',    '0122931-19.2026.8.04.1000', '70% do levantamento de R$ 9.533,67 — contrato de 30% pro escritório.'),
  -- 31/08
  ('39','2026-08-31'::date,'entrada', 4934.18, 'Pix recebido · Matheus Ferreira Enes',                  'Aporte de sócio',       null, null),
  ('40','2026-08-31'::date,'saida',    297.00, 'Pagar.me',                                              'Software e assinaturas',null, null),
  ('41','2026-08-31'::date,'saida',     67.00, 'Kiwify Tecnologia e Serviços',                          'Software e assinaturas',null, null),
  ('42','2026-08-31'::date,'saida',    160.00, 'Loja Constrói · tintas, rodo e pincel',                 'Material e manutenção', null, null),
  ('43','2026-08-31'::date,'saida',     57.00, 'Loja Constrói · led',                                   'Material e manutenção', null, null),
  ('44','2026-08-31'::date,'saida',     44.00, 'Loja Constrói · prateleira',                            'Material e manutenção', null, null),
  ('45','2026-08-31'::date,'saida',   2429.05, 'Repasse · Maria de Lourdes Silva dos Santos',           'Repasse ao cliente',    '0152648-76.2026.8.04.1000', '60% do levantamento de R$ 4.048,41 — contrato de 40% pro escritório.')
)
insert into public.balance_lancamentos
  (conta_id, categoria_id, tipo, valor, data, status, descricao, observacoes,
   cliente_id, processo_id, origem, origem_ref, pago_em)
select
  (select id from conta),
  cat.id,
  m.tipo,
  m.valor,
  m.dia,
  'realizado',
  m.descricao,
  m.obs,
  p.cliente_id,
  p.id,
  'manual',
  'extrato-2026-08|' || m.ref,
  m.dia::timestamptz
from mov m
left join public.balance_categorias cat
       on cat.nome = m.categoria and cat.tipo = m.tipo
left join public.processos p
       on p.numero_processo = m.processo;

-- ── repasses: quanto de cada entrada era do cliente ─────────────────────────
-- Um repasse por entrada processual que já teve a parte do cliente paga. Cada
-- um aponta pra entrada que o gerou e pra saída que o quitou, então o Balance
-- consegue responder "quanto desse saldo não é meu" olhando só os pendentes.
--
-- 0123276-82 (NICOLY) fica de fora de propósito: entrou R$ 1.500,00 e nada
-- saiu; sem o percentual do contrato, qualquer valor aqui seria chute.
with conta as (select id from public.balance_contas where nome = 'Conta Principal' limit 1),
par(ref_entrada, ref_saida, obs) as (values
  ('01','02','Contrato de 50%.'),
  ('03','05','Contrato de 50%.'),
  ('07','09','Contrato de 50%.'),
  ('14','21','Pago R$ 1.663,56; 50% daria R$ 1.514,00. Diferença de R$ 149,56 a conferir.'),
  ('15','35','Contrato de 50%.'),
  ('20','28','Pago R$ 1.663,56; 50% daria R$ 1.250,00. O Diego devolveu R$ 413,56 no mesmo dia.'),
  ('30','38','Contrato de 30% pro escritório — 70% do cliente.'),
  ('32','45','Contrato de 40% pro escritório — 60% do cliente.')
)
insert into public.balance_repasses
  (lancamento_entrada_id, cliente_id, processo_id, valor_devido,
   status, lancamento_saida_id, pago_em, observacoes)
select e.id, e.cliente_id, e.processo_id, s.valor, 'pago', s.id, s.data, par.obs
from par
join public.balance_lancamentos e on e.origem_ref = 'extrato-2026-08|' || par.ref_entrada
join public.balance_lancamentos s on s.origem_ref = 'extrato-2026-08|' || par.ref_saida;

comment on table public.balance_lancamentos is
  'Razão do Balance. Entrada e saída do escritório, previstas ou realizadas. Carga inicial: extrato de agosto/2026, fecha em R$ 22.180,76.';
