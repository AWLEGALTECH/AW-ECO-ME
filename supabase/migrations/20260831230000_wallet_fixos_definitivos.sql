-- Os custos fixos que o escritório definiu.
--
-- Ficam cinco, nomeados pelo escritório: aluguel, os dois pró-labores,
-- supermercado e estrutura digital. Saem as quatro sugestões que eu tinha
-- deduzido do extrato — três delas viram uma só, "Estrutura digital".
--
-- DE ONDE VEM CADA VALOR:
--
--   Aluguel de sala comercial  R$ 786,00  informado pelo escritório
--   Supermercado e copa        R$ 300,00  informado pelo escritório
--   Pró-labore Dr. Diego     R$ 4.000,00  "retirada Diego" na planilha de agosto
--   Pró-labore Dr. Matheus   R$ 1.500,00  "retirada Matheus" na planilha de agosto
--   Estrutura digital          R$ 282,00  Sala Pro Office 185 + Kiwify 67 + domínio 30
--
-- OS DOIS PRÓ-LABORES SÃO PALPITE ANCORADO, NÃO FATO. O escritório não passou
-- os valores, e eu não invento remuneração de sócio: peguei o que a própria
-- planilha do escritório chama de retirada em agosto. No extrato o Diego
-- recebeu R$ 4.195,03 num pix só (retirada + parcela da cadeira) e o Matheus
-- recebeu R$ 1.735,00 e R$ 2.250,00, mas esses dois espelham divisão de
-- processo, não retirada. Os valores aqui existem pra serem corrigidos no
-- lápis da tabela.
--
-- Nada disso vira lançamento sozinho: só a materialização do mês cria
-- lançamento, e ela é manual.

-- fora as sugestões que o escritório não confirmou
delete from public.balance_recorrentes
 where descricao in ('Sala Pro Office', 'Kiwify', 'Domínio', 'Tráfego empresarial');

insert into public.balance_recorrentes
  (descricao, conta_id, categoria_id, tipo, valor, dia_vencimento, inicio, ativo)
select v.descricao,
       (select id from public.balance_contas where banco = 'caixa' limit 1),
       (select id from public.balance_categorias where nome = v.categoria and tipo = 'saida' limit 1),
       'saida', v.valor, v.dia, date '2026-09-01', true
  from (values
    ('Aluguel de sala comercial',  786.00,  5, 'Aluguel'),
    ('Pró-labore Dr. Diego',      4000.00,  5, 'Pró-labore'),
    ('Pró-labore Dr. Matheus',    1500.00,  5, 'Pró-labore'),
    ('Supermercado e copa',        300.00, 10, 'Alimentação e copa'),
    ('Estrutura digital',          282.00,  8, 'Software e assinaturas')
  ) as v(descricao, valor, dia, categoria)
 where not exists (
   select 1 from public.balance_recorrentes r where r.descricao = v.descricao
 );
