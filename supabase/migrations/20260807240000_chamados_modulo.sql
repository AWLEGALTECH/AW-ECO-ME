-- Chamados vira um módulo controlável (aparece na grade de permissões).
-- Libera o acesso pros usuários aprovados atuais (admin já tem tudo por padrão).
-- Novos usuários são liberados na mão, como os demais módulos.
insert into public.user_module_access (user_id, module_key, granted_by)
select p.id, 'chamados', null
  from public.profiles p
 where coalesce(p.approved, false) = true
on conflict (user_id, module_key) do nothing;
