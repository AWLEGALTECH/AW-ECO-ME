-- Spy para quem tem o MÓDULO 'spy', não só admin.
--
-- As tabelas do Spy nasceram trancadas em fn_is_admin(): quem tinha o módulo
-- 'spy' (ex.: Diego) via o menu e a página, mas todas as consultas voltavam
-- vazias — nem análises, nem banco de transações, nem clientes analisados.
-- Agora o RLS segue o mesmo sistema de permissão do resto do app
-- (user_module_access): admin OU módulo 'spy' concedido.

create or replace function public.fn_tem_modulo(mod text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select public.fn_is_admin() or exists (
    select 1 from public.user_module_access uma
     where uma.user_id = auth.uid() and uma.module_key = mod
  );
$$;

drop policy if exists spy_analise_admin on public.spy_analise;
create policy spy_analise_modulo on public.spy_analise
  for all to authenticated
  using (public.fn_tem_modulo('spy'))
  with check (public.fn_tem_modulo('spy'));

drop policy if exists spy_transacao_admin on public.spy_transacao;
create policy spy_transacao_modulo on public.spy_transacao
  for all to authenticated
  using (public.fn_tem_modulo('spy'))
  with check (public.fn_tem_modulo('spy'));

drop policy if exists spy_flag_admin on public.spy_flag;
create policy spy_flag_modulo on public.spy_flag
  for all to authenticated
  using (public.fn_tem_modulo('spy'))
  with check (public.fn_tem_modulo('spy'));
