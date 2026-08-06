-- "Alteração vinculada" do writer-app: o writer (embutido, chave anon) grava
-- direto na ficha do cliente via REST (PATCH clientes). Faltava a policy de
-- UPDATE para o papel anon — então o PATCH voltava 204 (com Prefer:
-- return=minimal) mas atualizava 0 linhas: o botão "Vincular" parecia salvar,
-- porém a ficha do cliente nunca mudava (nem pras próximas peças da cadeia, nem
-- pra consultas). Concede o UPDATE anon pontual, na mesma linha do que já existe
-- em pre_clientes (anon insert) e demandas (anon insert).
drop policy if exists clientes_anon_update on public.clientes;
create policy clientes_anon_update on public.clientes
  for update to anon using (true) with check (true);
