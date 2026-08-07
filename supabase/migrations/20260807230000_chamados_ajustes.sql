-- Chamados: remove prioridade e troca as categorias.
--   tipos: bug | melhoria | ideia | duvida | outro
alter table public.chamados drop column if exists prioridade;

update public.chamados set tipo = 'melhoria' where tipo = 'implementacao';
alter table public.chamados drop constraint if exists chamados_tipo_check;
alter table public.chamados add constraint chamados_tipo_check
  check (tipo in ('bug','melhoria','ideia','duvida','outro'));

-- Rótulo do tipo na notificação de chamado aberto acompanha as novas categorias.
create or replace function public.fn_notif_chamado_aberto()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tl text; v_sis text;
begin
  v_tl := case new.tipo
            when 'bug' then 'Bug' when 'melhoria' then 'Melhoria'
            when 'ideia' then 'Ideia' when 'duvida' then 'Dúvida'
            when 'outro' then 'Outro' else new.tipo end;
  v_sis := coalesce(nullif(btrim(new.sistema), ''), 'Geral');
  perform public.fn_criar_notificacao(
    'chamado_aberto', 'Novo chamado 🎫',
    'Novo chamado (' || v_tl || ') em ' || v_sis || ': ' || new.titulo
      || '. Aberto por ' || coalesce(new.autor_nome, 'alguém') || '.',
    jsonb_build_object('titulo', new.titulo, 'tipo', v_tl, 'sistema', v_sis,
                       'autor', coalesce(new.autor_nome, 'Alguém')),
    '/chamados', new.created_by, new.autor_nome);
  return new;
end; $$;

update public.notificacao_config
   set variaveis = jsonb_set(variaveis, '{tipo}', '"Tipo (Bug/Melhoria/Ideia/Dúvida/Outro)"')
 where tipo = 'chamado_aberto';
