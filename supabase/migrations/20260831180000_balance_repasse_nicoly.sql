-- O repasse da NICOLY saiu no nome da mãe.
--
-- Os R$ 975,00 pagos a MARIA FABRÍCIA MOREIRA DE AGUIAR em 28/08 são o repasse
-- do acordo da NICOLY AGUIAR PERRONE (0123276-82.2026.8.04.1000): a mãe recebeu
-- por ela. Informação do escritório — não dava pra deduzir do extrato, porque o
-- nome do beneficiário não é o do cliente e ela não é cadastrada.
--
-- Com isso o lançamento deixa de ser órfão: passa a apontar pra cliente e pro
-- processo certos, e o acordo ganha o repasse que faltava.
--
-- FICA UM PONTO ABERTO. O acordo é de R$ 1.500,00 (fechado em 20/08, previsão
-- 03/09, pago adiantado em 28/08) e saíram R$ 975,00 — 65%. Não é nenhum dos
-- três percentuais do escritório: 50% daria 750,00, 60% daria 900,00 e 70%
-- daria 1.050,00. Não ajusto o valor pra encaixar num deles; fica registrado
-- como está no banco, com a divergência escrita.

update public.balance_lancamentos l
   set cliente_id  = p.cliente_id,
       processo_id = p.id,
       descricao   = 'Repasse · Nicoly Aguiar Perrone (recebido pela mãe, Maria Fabrícia Moreira de Aguiar)',
       observacoes = 'CONFERIR O PERCENTUAL: acordo de R$ 1.500,00, saíram R$ 975,00 — 65%. Não bate com 50% (R$ 750,00), 60% (R$ 900,00) nem 70% (R$ 1.050,00).',
       updated_at  = now()
  from public.processos p
 where l.origem_ref = 'extrato-2026-08|37'
   and p.numero_processo = '0123276-82.2026.8.04.1000';

-- a entrada do acordo some do balde "definir o repasse"
update public.balance_lancamentos
   set observacoes = 'Acordo fechado em 20/08 com previsão pra 03/09; caiu adiantado em 28/08. O repasse saiu no mesmo dia, no nome da mãe.',
       updated_at  = now()
 where origem_ref = 'extrato-2026-08|33';

-- o repasse que faltava, ligando a entrada do acordo à saída pra mãe
insert into public.balance_repasses
  (lancamento_entrada_id, cliente_id, processo_id, valor_devido,
   status, lancamento_saida_id, pago_em, observacoes)
select e.id, e.cliente_id, e.processo_id, s.valor, 'pago', s.id, s.data,
       'Pago à mãe da cliente. Percentual a conferir: R$ 975,00 sobre R$ 1.500,00 dá 65%.'
  from public.balance_lancamentos e
  join public.balance_lancamentos s on s.origem_ref = 'extrato-2026-08|37'
 where e.origem_ref = 'extrato-2026-08|33'
   and not exists (
     select 1 from public.balance_repasses r where r.lancamento_entrada_id = e.id
   );
