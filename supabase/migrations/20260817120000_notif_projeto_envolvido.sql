-- Aviso de entrada em projeto.
--
-- Entrar num projeto é o único momento em que alguém precisa ser puxado pra
-- uma aba que talvez nem estivesse olhando. Sem isso, a pessoa é adicionada e
-- só descobre quando abre Projetos por acaso.
--
-- A notificação é direcionada a quem entrou, inclusive quem criou o projeto e
-- se colocou nele. A copy é escrita numa forma que serve aos dois casos: dizer
-- "{autor} adicionou você" faria o criador falar de si na terceira pessoa.

insert into public.notificacao_config (tipo, label, ativo, visivel_usuarios)
values ('projeto_envolvido', 'Adicionado a um projeto', true, true)
on conflict (tipo) do nothing;

update public.notificacao_config set
  titulo_template = 'Você entrou num projeto 🧭',
  corpo_template  = 'Você faz parte do projeto {projeto}. Incluído por {autor}.',
  variaveis = jsonb_build_object(
    'projeto', 'Nome do projeto',
    'autor', 'Quem incluiu'),
  ativo = true,
  visivel_usuarios = true
where tipo = 'projeto_envolvido';

create or replace function public.fn_notif_projeto_envolvido()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_projeto text; v_autor text; v_actor uuid;
begin
  v_actor := auth.uid();
  select nome into v_projeto from public.projetos where id = new.projeto_id;
  if v_projeto is null then return new; end if;

  select coalesce(nullif(btrim(nome), ''), email, 'Alguém')
    into v_autor from public.profiles where id = v_actor;
  v_autor := coalesce(v_autor, 'Alguém');

  perform public.fn_criar_notificacao_ext(
    'projeto_envolvido', 'Você entrou num projeto 🧭',
    'Você faz parte do projeto ' || v_projeto || '. Incluído por ' || v_autor || '.',
    jsonb_build_object('projeto', v_projeto, 'autor', v_autor),
    '/projetos', v_actor, v_autor,
    new.user_id);
  return new;
end $$;

drop trigger if exists trg_notif_projeto_envolvido on public.projeto_envolvidos;
create trigger trg_notif_projeto_envolvido
  after insert on public.projeto_envolvidos
  for each row execute function public.fn_notif_projeto_envolvido();

-- Deixa o tipo permitido pra quem não é admin, senão a notificação chegaria
-- no push mas ficaria invisível no sino pra Matheus, Diego e Adria.
insert into public.notificacao_user_prefs (user_id, tipo, permitido)
select id, 'projeto_envolvido', true from public.profiles where approved
on conflict (user_id, tipo) do update set permitido = true;
