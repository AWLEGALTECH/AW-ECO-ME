-- Ultimo acesso de cada usuario, para a tela de Usuarios.
--
-- O dado mora em auth.users.last_sign_in_at, que o cliente nao pode ler: o
-- schema auth nao e exposto pela API. Entao ele sai por uma funcao SECURITY
-- DEFINER que so responde para admin — e devolve apenas o que a tela precisa,
-- e nao a linha inteira de auth.users, que tem token de recuperacao, hash de
-- senha e afins.

create or replace function public.fn_admin_usuarios()
returns table (
  id                uuid,
  email             text,
  nome              text,
  avatar_url        text,
  role              text,
  approved          boolean,
  created_at        timestamptz,
  ultimo_acesso     timestamptz,
  modulos           int
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.fn_is_admin() then
    raise exception 'apenas administradores';
  end if;

  return query
  select p.id, p.email, p.nome, p.avatar_url, p.role, p.approved, p.created_at,
         u.last_sign_in_at,
         (select count(*)::int from public.user_module_access a where a.user_id = p.id)
    from public.profiles p
    left join auth.users u on u.id = p.id
   order by p.nome nulls last, p.email;
end;
$function$;

grant execute on function public.fn_admin_usuarios() to authenticated;
