-- MÓDULO "ATENDIMENTO" — libera a maquete pra quem vai opinar sobre ela.
--
-- A tela é maquete: dados inventados, nada gravado. Mas ela mora dentro do app
-- e o app esconde módulo que a pessoa não tem, então sem esta linha ninguém
-- consegue abrir pra ver.
--
-- Vai só pra quem foi escolhido como usuário do MVP: a Adria, que opera, e o
-- Dr. Matheus, que acompanha o funil. Admin já enxerga tudo por definição.
-- Diego e João ficam de fora por ora — é um clique adicionar depois, e enquanto
-- é maquete não faz sentido espalhar tela com gente inventada dentro.

insert into public.user_module_access (user_id, module_key)
select p.id, 'atendimento'
  from public.profiles p
 where p.approved
   and p.nome in ('Adria Mota', 'Matheus Ferreira Enes')
on conflict do nothing;
