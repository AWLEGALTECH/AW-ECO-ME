-- A comissão da estagiária passa do dia 15 pro dia 5.
--
-- Eu tinha sugerido o 15 por dois motivos: dar duas semanas pra fechar o mês
-- antes de pagar, e não empilhar tudo no dia 5. O escritório decidiu pelo 5 —
-- pagar perto do mês trabalhado vale mais que os dois.
--
-- A competência não muda: ela continua sendo -1, o mês anterior ao pagamento.
-- Essa parte não dependia da data e é ela que faz a comissão contar como custo
-- do mês em que foi ganha.
--
-- Consequência que fica registrada: com o aluguel (786), os dois pró-labores
-- (4.000 e 1.500) e a comissão (600) no mesmo dia, saem R$ 6.886,00 de uma vez
-- no dia 5. Somando a bolsa do último dia do mês anterior, são R$ 7.586,00 numa
-- janela de seis dias — e é justamente quando ainda não entrou alvará no mês.

update public.balance_recorrentes
   set dia_vencimento = 5, updated_at = now()
 where descricao = 'Comissão da estagiária';
