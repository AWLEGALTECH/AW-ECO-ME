-- OS TÍTULOS DAS COBRANÇAS PERDEM O TRAVESSÃO.
--
-- "1º follow-up — retomar" aparecia inteiro na faixa do topo da conversa e na
-- aba de tasks. Além do caractere proibido nesta casa, o título repetia uma
-- informação que o rótulo logo acima já dá (qual rodada é) e gastava o espaço
-- que devia dizer O QUE FAZER. Agora o rótulo diz o degrau ("Follow-up de 5
-- dias") e o título diz a ação ("Tirar o obstáculo").
--
-- Espelha src/lib/followUp.ts (INTENCAO), que tem os testes.

create or replace function public.fn_wa_followup_concluir(p_task uuid, p_por uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t         public.wa_tasks%rowtype;
  v_cad     int[] := public.fn_wa_cadencia();
  v_prox    int;
  v_dia     date;
  v_id      uuid;
  v_titulo  text;
  v_detalhe text;
begin
  select * into t from public.wa_tasks where id = p_task;
  if not found or t.tipo <> 'follow_up' then return null; end if;

  update public.wa_tasks
     set feita = true, feita_em = now(), feita_por = coalesce(p_por, feita_por), updated_at = now()
   where id = p_task;

  v_prox := coalesce(t.rodada, 1) + 1;
  if v_prox > array_length(v_cad, 1) then
    return null;                       -- fim da regua: sai da cadencia
  end if;

  v_dia := current_date + (v_cad[v_prox] - v_cad[v_prox - 1]);

  v_titulo := case v_prox
    when 2 then 'Tirar o obstáculo'
    when 3 then 'Trazer novidade'
    when 4 then 'Checar se ainda faz sentido'
    when 5 then 'Encerrar ou reabrir'
  end;
  v_detalhe := case v_prox
    when 2 then 'Cinco dias. Quem some nessa altura em geral travou em algo concreto. Pergunte o que falta para decidir.'
    when 3 then 'Quinze dias. Repetir a mesma pergunta não move. Traga algo novo: um caso parecido, um prazo que mudou.'
    when 4 then 'Trinta dias. Pergunte diretamente se o assunto ainda está de pé. Resposta negativa também é resposta.'
    when 5 then 'Sessenta dias. Última da régua. Deixe a porta aberta e registre o desfecho; depois desta, o lead sai da cadência.'
  end;

  insert into public.wa_tasks (conversa_id, titulo, detalhe, dia, tipo, rodada)
       values (t.conversa_id, v_titulo, v_detalhe, v_dia, 'follow_up', v_prox)
    on conflict do nothing
    returning id into v_id;

  return v_id;
end $$;

-- A primeira rodada nasce na sincronizacao, entao o titulo dela mora la.
-- (corpo identico ao da migration anterior, so o texto do insert muda)
create or replace function public.fn_wa_followups_sincronizar(p_instancia text default null)
returns table (criadas int, canceladas int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_criadas int := 0;
  v_cancel  int := 0;
  v_cad     int[] := public.fn_wa_cadencia();
begin
  with mortas as (
    select t.id,
           case
             when c.atendimento_finalizado_em is not null then 'atendimento finalizado'
             when c.arquivada                             then 'conversa arquivada'
             when c.etapa = 'fechado'                     then 'lead fechou'
             else 'o lead respondeu'
           end as motivo
      from public.wa_tasks t
      join public.wa_conversas c on c.id = t.conversa_id
     where t.tipo = 'follow_up' and t.feita = false and t.cancelada_em is null
       and (p_instancia is null or c.instancia ilike p_instancia)
       and (
            c.arquivada
         or c.etapa = 'fechado'
         or c.atendimento_finalizado_em is not null
         or (select m.direcao from public.wa_mensagens m
              where m.conversa_id = c.id
              order by m.criada_em desc limit 1) = 'entrada'
       )
  )
  update public.wa_tasks t
     set cancelada_em = now(), cancelada_motivo = m.motivo, updated_at = now()
    from mortas m
   where t.id = m.id;
  get diagnostics v_cancel = row_count;

  with elegiveis as (
    select c.id,
           (select m.criada_em from public.wa_mensagens m
             where m.conversa_id = c.id order by m.criada_em desc limit 1) as ultima_em,
           (select m.direcao   from public.wa_mensagens m
             where m.conversa_id = c.id order by m.criada_em desc limit 1) as ultima_direcao
      from public.wa_conversas c
     where not c.arquivada
       and coalesce(c.etapa, 'chegou') <> 'fechado'
       and c.atendimento_finalizado_em is null
       and (p_instancia is null or c.instancia ilike p_instancia)
       and not exists (
             select 1 from public.wa_tasks t
              where t.conversa_id = c.id and t.tipo = 'follow_up'
                and t.feita = false and t.cancelada_em is null
           )
  ),
  novas as (
    select e.id, (e.ultima_em::date + v_cad[1]) as dia
      from elegiveis e
     where e.ultima_direcao = 'saida'
       and e.ultima_em is not null
       and (select count(*) from public.wa_tasks t
             where t.conversa_id = e.id and t.tipo = 'follow_up' and t.feita)
           < array_length(v_cad, 1)
  )
  insert into public.wa_tasks (conversa_id, titulo, detalhe, dia, tipo, rodada)
  select n.id,
         'Retomar de onde parou',
         'Um dia sem resposta. Retome sem cobrar: pergunte se ficou alguma dúvida do que foi dito.',
         n.dia, 'follow_up', 1
    from novas n
  on conflict do nothing;
  get diagnostics v_criadas = row_count;

  return query select v_criadas, v_cancel;
end $$;

-- As cobrancas que ja existem tambem trocam de titulo: deixar as antigas com o
-- texto velho faria a fila ter dois vocabularios ao mesmo tempo.
update public.wa_tasks set
  titulo = case rodada
    when 1 then 'Retomar de onde parou'
    when 2 then 'Tirar o obstáculo'
    when 3 then 'Trazer novidade'
    when 4 then 'Checar se ainda faz sentido'
    when 5 then 'Encerrar ou reabrir'
    else titulo end,
  detalhe = case rodada
    when 1 then 'Um dia sem resposta. Retome sem cobrar: pergunte se ficou alguma dúvida do que foi dito.'
    when 4 then 'Trinta dias. Pergunte diretamente se o assunto ainda está de pé. Resposta negativa também é resposta.'
    else detalhe end
where tipo = 'follow_up';
