-- A BASE DA LP BRADESCO PASSA DO NÚMERO DE ENTRADA PARA O DE PROSPECÇÃO.
--
-- Uma base de leads mora num número: `leads_fontes.instancia` é o que decide em
-- qual caixa a fila aparece (`useFontes` filtra por ela) e, por consequência,
-- de qual número sai a primeira mensagem — a conversa é aberta na instância que
-- está na tela. Enquanto a Bradesco apontava para PORTAL DIREITO ABERTO
-- (na tela, "PDA INBOUND"), abordar alguém da lista significava sair pelo
-- número que existe para RECEBER quem procura o escritório.
--
-- Prospecção ativa e atendimento passivo no mesmo número misturam duas coisas
-- que se medem e se arriscam de formas diferentes: o volume de saída para
-- desconhecidos é o que faz um número ser marcado, e é o número de entrada —
-- o que está nas peças, o que as pessoas já têm salvo — que não pode cair.
-- A base vai para PORTAL DIREITO ABERTO 2 ("PDA OUTBOUND"), que existe para
-- isso.
--
-- ⚠️ O QUE ISTO **NÃO** FAZ: as 19 conversas já abertas continuam onde estão.
-- Elas não são "a base" — são pessoas que já estão falando com o número de
-- entrada, com histórico lá e com aquele contato salvo no celular delas.
-- Arrastá-las junto seria trocar o número no meio da conversa, o que o sistema
-- até sabe fazer (`fn_wa_mover_conversa`), mas uma a uma e por decisão de quem
-- atende — não por efeito colateral de mudar para onde aponta a fila do que
-- ainda nem foi abordado. Os 616 que esperam vão todos, que é o pedido.
update public.leads_fontes
   set instancia = 'PORTAL DIREITO ABERTO 2'
 where nome = 'Leads Bradesco'
   and instancia = 'PORTAL DIREITO ABERTO';
