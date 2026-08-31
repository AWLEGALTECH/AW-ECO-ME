-- Os custos fixos mensais do escritório.
--
-- DOIS VIERAM DO ESCRITÓRIO, os outros quatro saíram do extrato de agosto:
--
--   Aluguel de sala comercial  R$ 786,00  ← informado
--   Supermercado e copa        R$ 300,00  ← informado
--   Sala Pro Office            R$ 185,00  ← "sala pro office" na planilha
--   Tráfego empresarial        R$ 250,00  ← "trafego empresarial" na planilha
--   Kiwify                     R$  67,00  ← débito de 31/08 no extrato
--   Domínio                    R$  30,00  ← "dominio" na planilha
--
-- Os quatro últimos são sugestão, não fato consumado: eu vi esses valores
-- saírem uma vez em agosto, o que não prova que sejam mensais. Ficam aí pra
-- serem confirmados, corrigidos ou apagados na tela — nenhum deles vira
-- lançamento sozinho enquanto ninguém clicar em "Gerar o mês".
--
-- Os dias de vencimento são um chute honesto pela ordem em que as coisas
-- costumam cair no mês; o extrato não mostra dia fixo pra nenhum deles.
--
-- Idempotente: não duplica se rodar de novo, porque casa por descrição.

insert into public.balance_recorrentes
  (descricao, conta_id, categoria_id, tipo, valor, dia_vencimento, inicio, ativo)
select v.descricao,
       (select id from public.balance_contas where banco = 'caixa' limit 1),
       (select id from public.balance_categorias where nome = v.categoria and tipo = 'saida' limit 1),
       'saida', v.valor, v.dia, date '2026-08-01', true
  from (values
    ('Aluguel de sala comercial', 786.00,  5, 'Aluguel'),
    ('Supermercado e copa',       300.00, 10, 'Alimentação e copa'),
    ('Sala Pro Office',           185.00,  8, 'Software e assinaturas'),
    ('Tráfego empresarial',       250.00, 15, 'Marketing e tráfego'),
    ('Kiwify',                     67.00, 28, 'Software e assinaturas'),
    ('Domínio',                    30.00, 20, 'Software e assinaturas')
  ) as v(descricao, valor, dia, categoria)
 where not exists (
   select 1 from public.balance_recorrentes r where r.descricao = v.descricao
 );
