-- Arquivar um cliente zera o pipeline dele.
--
-- Antes, arquivar so mexia na tabela clientes: ele sumia da lista de clientes
-- e continuava na esteira, no dashboard, nas contagens do menu. Cliente que
-- nao se acha mais seguia ocupando fila de trabalho.
--
-- Toda tela de pipeline ja exclui demanda cancelada (.neq status cancelada ou
-- .eq status pendente). Entao a forma de tirar o cliente do pipeline inteiro,
-- sem caçar consulta por consulta, e cancelar as demandas abertas dele — e o
-- vocabulario de cancelamento (cancelado_at/por/motivo/detalhe) ja existe
-- justamente para deixar registro do que houve.
--
-- O registro fica: a ficha do cliente mostra as demandas canceladas com o
-- motivo. O que sai e a fila geral.

-- Guarda o status de antes para que desarquivar devolva a demanda ao ponto em
-- que ela estava, e nao a um "pendente" generico.
alter table public.demandas
  add column if not exists status_pre_arquivamento text;

comment on column public.demandas.status_pre_arquivamento is
  'Status que a demanda tinha quando o cliente foi arquivado. Preenchido so pelo arquivamento; desarquivar consome e limpa.';

create or replace function public.fn_arquivar_cliente(
  p_cliente_id uuid,
  p_ultimo_contato date,
  p_motivo text,
  p_autor uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nome       text;
  v_canceladas int := 0;
begin
  select nome into v_nome from public.clientes where id = p_cliente_id;
  if v_nome is null then raise exception 'cliente % nao encontrado', p_cliente_id; end if;
  if p_ultimo_contato is null then raise exception 'data do ultimo contato e obrigatoria'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'motivo do arquivamento e obrigatorio'; end if;

  -- Demanda ja concluida/resolvida/cancelada nao esta na fila: nao se mexe.
  with alvo as (
    select id, status from public.demandas
     where cliente_id = p_cliente_id
       and status in ('pendente', 'em_andamento', 'bloqueada')
  ), upd as (
    update public.demandas d
       set status                   = 'cancelada',
           status_pre_arquivamento  = a.status,
           cancelado_at             = now(),
           cancelado_por            = p_autor,
           cancelamento_motivo      = 'cliente_arquivado',
           cancelamento_detalhe     = btrim(p_motivo)
      from alvo a
     where d.id = a.id
    returning d.id
  )
  select count(*) into v_canceladas from upd;

  update public.clientes
     set arquivado_em      = now(),
         arquivado_por     = p_autor,
         arquivado_motivo  = btrim(p_motivo),
         ultimo_contato_em = p_ultimo_contato
   where id = p_cliente_id;

  return jsonb_build_object('cliente', v_nome, 'demandas_canceladas', v_canceladas);
end;
$function$;

-- Desarquivar desfaz o que o arquivamento fez, e so isso: devolve a fila ao
-- ponto em que ela parou. Demanda cancelada a mao antes do arquivamento nao
-- tem status_pre_arquivamento e continua cancelada, como deve.
create or replace function public.fn_desarquivar_cliente(
  p_cliente_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nome       text;
  v_restauradas int := 0;
begin
  select nome into v_nome from public.clientes where id = p_cliente_id;
  if v_nome is null then raise exception 'cliente % nao encontrado', p_cliente_id; end if;

  with upd as (
    update public.demandas
       set status                  = status_pre_arquivamento,
           status_pre_arquivamento = null,
           cancelado_at            = null,
           cancelado_por           = null,
           cancelamento_motivo     = null,
           cancelamento_detalhe    = null
     where cliente_id = p_cliente_id
       and status_pre_arquivamento is not null
       and cancelamento_motivo = 'cliente_arquivado'
    returning id
  )
  select count(*) into v_restauradas from upd;

  -- O motivo e a data do ultimo contato ficam: eles contam o que aconteceu
  -- com esta pessoa, e isso nao deixa de ser verdade porque ela voltou.
  update public.clientes
     set arquivado_em = null, arquivado_por = null
   where id = p_cliente_id;

  return jsonb_build_object('cliente', v_nome, 'demandas_restauradas', v_restauradas);
end;
$function$;

grant execute on function public.fn_arquivar_cliente(uuid, date, text, uuid) to authenticated;
grant execute on function public.fn_desarquivar_cliente(uuid) to authenticated;
