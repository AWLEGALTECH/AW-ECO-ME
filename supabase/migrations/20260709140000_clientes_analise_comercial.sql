-- Snapshot da análise comercial (Finder ou descontos manuais do Writer) no
-- próprio cliente. Guarda o array de rubricas {rubrica, valor, bloqueada,
-- motivo} pra que, na análise primária da esteira, os descontos bloqueados
-- na análise comercial apareçam travados — impedindo que a análise primária
-- reconsidere um desconto já descartado no comercial.
--
-- Preenchido na confirmação do pré-cliente (src/pages/PreClientes.tsx) a
-- partir de dados_completos.dadosKit._analise_comercial.

alter table public.clientes
  add column if not exists analise_comercial jsonb;
