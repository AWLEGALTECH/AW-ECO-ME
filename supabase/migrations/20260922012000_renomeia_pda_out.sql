-- A INSTÂNCIA "PORTAL DIREITO ABERTO 2" VIROU "PDA OUT".
--
-- Mesmo caminho da 20260922010000 (PDA IN): a instância foi apagada e
-- recriada no Manager da Evolution com o mesmo número (92 99507-6380) e nome
-- novo. O rename percorre todas as tabelas que guardam o nome, na mesma
-- transação, via fn_wa_renomear_instancia.

select public.fn_wa_renomear_instancia('PORTAL DIREITO ABERTO 2', 'PDA OUT');
