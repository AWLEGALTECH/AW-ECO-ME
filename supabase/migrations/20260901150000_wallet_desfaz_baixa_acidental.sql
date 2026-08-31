-- Desfaz uma baixa dada por engano.
--
-- O pró-labore do Dr. Matheus de agosto (R$ 1.500,00, vencimento 05/08) foi
-- marcado como pago em 31/08 às 17:10 por um clique acidental: o botão "dar
-- baixa" agia direto, sem perguntar nada. O escritório já tinha informado que
-- esse não está pago.
--
-- Volta a `previsto`, que é o estado correto. Enquanto previsto ele não conta
-- no saldo realizado, então o caixa volta a fechar nos R$ 22.180,76 da
-- planilha — a baixa acidental tinha derrubado pra R$ 20.680,76.
--
-- A causa está sendo corrigida junto: o botão passa a abrir uma confirmação.

update public.balance_lancamentos
   set status     = 'previsto',
       pago_em    = null,
       updated_at = now()
 where id = 'a1031e02-0c79-4060-96e9-abe296d01b3b'
   and descricao = 'Pró-labore Dr. Matheus';
