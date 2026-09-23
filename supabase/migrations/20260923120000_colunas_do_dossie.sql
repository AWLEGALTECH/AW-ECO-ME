-- AS COLUNAS DA PLANILHA QUE APARECEM NO DOSSIÊ DA CONVERSA.
--
-- Pedido do chefe (23/09): o dossiê do lead mostrava foto, nome, número e
-- origem, e nada do que a pessoa respondeu na landing. As respostas moram em
-- `leads_brutos.bruto`, e a conversa já aponta para essa linha por
-- `wa_conversas.lead_bruto_id` (134 das 214 conversas, hoje); só faltava a tela
-- ler e deixar escolher.
--
-- É uma coluna PRÓPRIA, e não a `colunas_exibidas`, porque são duas perguntas
-- diferentes. `colunas_exibidas` escolhe o que o CARTÃO DA FILA mostra, que tem
-- espaço para duas ou três linhas e existe para decidir se a conversa vale ser
-- aberta. O dossiê é consulta durante a conversa, e costuma querer mais. Uma
-- coluna só obrigaria a escolher entre um cartão entupido e um dossiê pobre.
--
-- Mora na BASE (e não na pessoa) pelo mesmo motivo da outra: cada planilha tem
-- as suas colunas, e a equipe inteira atende a mesma base.
--
-- Nula ou vazia quer dizer "o que a planilha trouxe além do contato", que é a
-- mesma regra do cartão: base nova já nasce mostrando alguma coisa.

alter table public.leads_fontes
  add column if not exists colunas_dossie text[];

comment on column public.leads_fontes.colunas_dossie is
  'Colunas da planilha mostradas no dossiê da conversa, na ordem escolhida. Nulo = tudo além do contato.';
