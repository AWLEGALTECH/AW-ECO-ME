-- Dois cumprimentos que já foram pagos, informados pelo Dr. Matheus.
--
--   DARLENE ANDRADE MONTEIRO  · 0122931-19.2026.8.04.1000 · R$ 9.533,67
--   MARIA DE LOURDES S SANTOS · 0152648-76.2026.8.04.1000 · R$ 4.048,41
--
-- SEM LANÇAR NADA NO WALLET. Os dois alvarás já entraram na conta pelo extrato
-- de agosto (27/08 e 28/08) e os repasses aos clientes já saíram e estão
-- quitados. Passar pela baixa normal criaria a entrada de novo e inflaria o
-- caixa em R$ 13.582,08 — o dinheiro já está lá, o que falta é só o Tracker
-- saber disso.
--
-- Por isso esta migration mexe só no status. É o caso que a tela ainda não
-- cobre: dinheiro que entrou por fora e precisa de baixa retroativa. Enquanto
-- não existir esse caminho na interface, ele passa por aqui, um a um e escrito.
--
-- Com ALVARÁ PAGO, os dois saem do Tracker por conta da rotatividade — deixam
-- de contar como valor a receber e aparecem no bloco "Já recebido". A conta do
-- Tracker cai de R$ 525.955,61 para R$ 512.373,53.

update public.processos p
   set fase_processual = 'ALVARÁ PAGO',
       linha_temporal  = (
         select jsonb_agg(
                  case when e->>'status' = 'atual'
                       then e || jsonb_build_object('statusProcessual', 'ALVARÁ PAGO')
                       else e end
                  order by ord)
           from jsonb_array_elements(p.linha_temporal) with ordinality as t(e, ord)
       ),
       updated_at = now()
 where p.numero_processo in ('0122931-19.2026.8.04.1000', '0152648-76.2026.8.04.1000')
   -- só mexe se houver etapa atual pra carimbar; sem ela a linha ficaria nula
   and exists (
     select 1 from jsonb_array_elements(coalesce(p.linha_temporal,'[]'::jsonb)) e
      where e->>'status' = 'atual'
   );

-- e a ficha acompanha mesmo quem não tiver etapa atual
update public.processos
   set fase_processual = 'ALVARÁ PAGO', updated_at = now()
 where numero_processo in ('0122931-19.2026.8.04.1000', '0152648-76.2026.8.04.1000')
   and fase_processual <> 'ALVARÁ PAGO';
