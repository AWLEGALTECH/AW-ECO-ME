-- Um fechamento de agosto nasceu em setembro por causa do fuso.
--
-- A tela carimbava a data com `new Date().toISOString()`, que é UTC. Manaus é
-- UTC-4, então das 20h à meia-noite o ISO já está no dia seguinte. O fechamento
-- da Adria pro VITOR OLIVEIRA DE SOUZA foi criado às 20:12 de 31/08 em Manaus,
-- e gravou 01/09 — caiu na comissão de setembro em vez da de agosto.
--
-- Não é detalhe de calendário: são seis rubricas a R$ 5,00 saindo do mês em que
-- foram fechadas. E aconteceu justamente na noite do fechamento, que é quando
-- essas quatro horas mais importam.
--
-- A REGRA DA CORREÇÃO É ESTREITA de propósito. Só toca em fechamento cuja data
-- gravada é exatamente o dia UTC do `created_at` — assinatura de carimbo
-- automático — e cujo dia em Manaus é outro. Fechamento que alguém datou à mão
-- pra frente ou pra trás não bate nessa condição e fica intocado.
--
-- A causa está corrigida no mesmo commit: src/lib/hoje.ts passa a ser a única
-- fonte de "que dia é hoje", pelo calendário de quem está olhando, e os nove
-- lugares que faziam a conta em UTC passam a usá-la.

update public.fechamentos
   set data       = timezone('America/Manaus', created_at)::date,
       updated_at = now()
 where data = (created_at at time zone 'UTC')::date
   and data <> timezone('America/Manaus', created_at)::date;
