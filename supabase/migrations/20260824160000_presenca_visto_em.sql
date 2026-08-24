-- Ultimo acesso preciso.
--
-- Ate aqui o valor era deduzido de auth.sessions.updated_at, que so muda
-- quando o token e renovado — a cada hora. Quem estava trabalhando naquele
-- instante aparecia "ha 47 minutos", e o numero andava aos saltos de uma hora.
-- Deduzir presenca de um evento que acontece de hora em hora nao da pra
-- consertar afinando a conta: o dado nao existe na granularidade certa.
--
-- Entao o proprio app passa a carimbar presenca. Uma coluna e uma funcao que
-- so escreve na linha de quem chamou, e o cliente bate nela ao abrir e de
-- poucos em poucos minutos enquanto a aba estiver em uso.

alter table public.profiles
  add column if not exists visto_em timestamptz;

comment on column public.profiles.visto_em is
  'Ultima vez que o app deste usuario deu sinal de vida. Carimbado pelo proprio cliente via fn_marcar_presenca.';

-- Semente: sem isso, todo mundo apareceria "nunca entrou" ate abrir o app pela
-- primeira vez depois deste deploy.
update public.profiles p
   set visto_em = greatest(
         u.last_sign_in_at,
         (select max(s.updated_at) from auth.sessions s where s.user_id = p.id))
  from auth.users u
 where u.id = p.id and p.visto_em is null;

-- Escreve so na propria linha. Nao precisa de parametro: quem e o usuario vem
-- do token, entao nao ha como um carimbar presenca no lugar do outro.
create or replace function public.fn_marcar_presenca()
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.profiles set visto_em = now() where id = auth.uid();
$function$;

grant execute on function public.fn_marcar_presenca() to authenticated;

-- O ultimo acesso passa a ser o maior entre a presenca carimbada, a renovacao
-- de sessao e o ultimo login. Os dois ultimos seguem valendo como piso: cobrem
-- quem ainda nao abriu o app depois desta mudanca.
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
         greatest(
           p.visto_em,
           u.last_sign_in_at,
           (select max(s.updated_at) from auth.sessions s where s.user_id = p.id)
         ),
         (select count(*)::int from public.user_module_access a where a.user_id = p.id)
    from public.profiles p
    left join auth.users u on u.id = p.id
   order by p.nome nulls last, p.email;
end;
$function$;

grant execute on function public.fn_admin_usuarios() to authenticated;
