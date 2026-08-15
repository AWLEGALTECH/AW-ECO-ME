-- Chamado resolvido: mesma lógica do chamado aberto
--
-- Antes: a notificação de resolução era só pro autor (destinatario_id) e tinha
-- uma trava — `created_by is distinct from resolvido_por` — que silenciava o
-- caso mais comum na prática: o admin resolve um chamado que ele mesmo abriu.
-- Resultado: 15 notificações de "chamado aberto" contra 2 de "resolvido".
--
-- Agora ela espelha o `chamado_aberto`: dispara sempre que o status vira
-- 'resolvido' e o corpo cita tipo + sistema + título + quem resolveu, do mesmo
-- jeito que o de abertura. O `destinatario_id` continua apontando pro autor,
-- pra que ele veja mesmo sem ser admin.

update public.notificacao_config set
  titulo_template = 'Chamado resolvido ✅',
  corpo_template  = 'Chamado ({tipo}) em {sistema}: {titulo}. Resolvido por {resolvido_por}.',
  variaveis = jsonb_build_object(
    'tipo', 'Tipo (Bug/Implementação/Ideia)',
    'sistema', 'Aba/área do chamado',
    'titulo', 'Título do chamado',
    'resolvido_por', 'Quem resolveu',
    'autor', 'Quem tinha aberto'),
  ativo = true
where tipo = 'chamado_resolvido';

create or replace function public.fn_notif_chamado_resolvido()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tl text; v_sis text; v_quem text;
begin
  if new.status <> 'resolvido' or old.status is not distinct from 'resolvido' then
    return new;
  end if;

  v_tl  := case new.tipo when 'bug' then 'Bug' when 'implementacao' then 'Implementação'
                         when 'ideia' then 'Ideia' else new.tipo end;
  v_sis := coalesce(nullif(btrim(new.sistema), ''), 'Geral');
  v_quem := coalesce(nullif(btrim(new.resolvido_por_nome), ''), 'a equipe');

  perform public.fn_criar_notificacao_ext(
    'chamado_resolvido', 'Chamado resolvido ✅',
    'Chamado (' || v_tl || ') em ' || v_sis || ': ' || new.titulo
      || '. Resolvido por ' || v_quem || '.',
    jsonb_build_object('titulo', new.titulo, 'tipo', v_tl, 'sistema', v_sis,
                       'resolvido_por', v_quem,
                       'autor', coalesce(new.autor_nome, 'Alguém')),
    '/chamados', new.resolvido_por, new.resolvido_por_nome,
    new.created_by);
  return new;
end; $$;

drop trigger if exists trg_notif_chamado_resolvido on public.chamados;
create trigger trg_notif_chamado_resolvido
  after update on public.chamados
  for each row execute function public.fn_notif_chamado_resolvido();
