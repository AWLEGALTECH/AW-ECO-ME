-- AS FUNÇÕES DO FOLLOW-UP, AGORA CIENTES DE QUAL NÚMERO ESTÃO TRATANDO.
--
-- Segunda metade da mudança que fez a régua ser de cada número (ver
-- 20260907230000). Ali as tabelas ganharam `instancia` na chave; aqui as
-- funções que as leem param de falar de "a régua" e passam a falar da régua de
-- um número — e passam a respeitar quem está fora dela, por decisão do contato
-- ou por regra do número.

/* A CHECAGEM DE ORDEM PASSA A SER POR NÚMERO. Ela comparava a tabela inteira, e
   com linhas de dois números misturadas passaria a comparar o degrau 5 do
   Portal com o degrau 1 do escritório — recusando réguas perfeitamente
   válidas, com uma mensagem que fala de uma régua que ninguém escreveu. */
create or replace function public.fn_wa_cadencia_valida()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  fora int;
begin
  select count(*) into fora
    from (
      select instancia, dias,
             lag(dias) over (partition by instancia order by rodada) as anterior
        from public.wa_followup_cadencia
    ) t
   where t.anterior is not null and t.dias <= t.anterior;

  if fora > 0 then
    raise exception 'A régua precisa subir: cada rodada tem que esperar mais dias que a anterior.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

/* E VOLTA, agora comparando dentro de cada número. */
drop trigger if exists trg_wa_followup_cadencia_ordem on public.wa_followup_cadencia;
create constraint trigger trg_wa_followup_cadencia_ordem
  after insert or update on public.wa_followup_cadencia
  deferrable initially deferred
  for each row execute function public.fn_wa_cadencia_valida();

-- ── as funções passam a saber de qual número estão falando ──────────────────

/* A VERSÃO SEM ARGUMENTO SAI DE CENA, e isso é obrigatório e não arrumação:
   `create or replace` com um parâmetro novo cria uma SOBRECARGA, não substitui.
   As duas conviveriam, a antiga leria a tabela inteira — agora com linha de
   todos os números misturada — e devolveria uma régua de dez degraus para quem
   ainda a chamasse. Um erro que não levanta exceção nenhuma. */
drop function if exists public.fn_wa_cadencia();

/* A régua DAQUELE número. Sem linha própria, o padrão de fábrica: número novo
   nasce cobrando de 1, 5, 15, 30 e 60 dias, e não sem régua nenhuma. */
create or replace function public.fn_wa_cadencia(p_instancia text default null)
returns integer[]
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    (select array_agg(dias order by rodada)
       from public.wa_followup_cadencia
      where p_instancia is not null and instancia ilike p_instancia),
    array[1, 5, 15, 30, 60]);
$$;

/* ESTE CONTATO ENTRA NA RÉGUA?
   A decisão dele vence; sem decisão, vale a regra do número; sem regra
   gravada, entra — que é como o sistema sempre funcionou. Uma função só porque
   a mesma pergunta é feita em três lugares, e três cópias divergiriam. */
create or replace function public.fn_wa_followup_ligado(p_conversa uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    c.followup_ativo,
    (select r.padrao_ativo from public.wa_followup_regras r where r.instancia ilike c.instancia),
    true)
    from public.wa_conversas c where c.id = p_conversa;
$$;

create or replace function public.fn_wa_followups_sincronizar(p_instancia text default null)
returns table(criadas integer, canceladas integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_criadas int := 0;
  v_cancel  int := 0;
begin
  /* AS QUE MORRERAM. Ganhou um motivo novo: o follow-up foi desligado para
     aquele contato (ou para o número inteiro). Sem cancelar aqui, desligar
     deixaria a cobrança já criada viva na fila — e a pessoa continuaria sendo
     cobrada depois de alguém dizer explicitamente que não. */
  with mortas as (
    select t.id,
           case
             when not public.fn_wa_followup_ligado(c.id)  then 'follow-up desligado'
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
         or not public.fn_wa_followup_ligado(c.id)
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

  /* AS QUE NASCEM. O primeiro degrau agora vem da régua DAQUELE número, e não
     de uma régua só para todos: é isso que faz o Portal cobrar em um dia e o
     escritório em sete, na mesma varredura. */
  with elegiveis as (
    select c.id, c.instancia,
           (select m.criada_em from public.wa_mensagens m
             where m.conversa_id = c.id order by m.criada_em desc limit 1) as ultima_em,
           (select m.direcao   from public.wa_mensagens m
             where m.conversa_id = c.id order by m.criada_em desc limit 1) as ultima_direcao
      from public.wa_conversas c
     where not c.arquivada
       and coalesce(c.etapa, 'chegou') <> 'fechado'
       and c.atendimento_finalizado_em is null
       and (p_instancia is null or c.instancia ilike p_instancia)
       and public.fn_wa_followup_ligado(c.id)
       and not exists (
             select 1 from public.wa_tasks t
              where t.conversa_id = c.id and t.tipo = 'follow_up'
                and t.feita = false and t.cancelada_em is null
           )
  ),
  novas as (
    select e.id, (e.ultima_em::date + cad.v[1]) as dia
      from elegiveis e
      cross join lateral (select public.fn_wa_cadencia(e.instancia) as v) cad
     where e.ultima_direcao = 'saida'
       and e.ultima_em is not null
       and (select count(*) from public.wa_tasks t
             where t.conversa_id = e.id and t.tipo = 'follow_up' and t.feita)
           < array_length(cad.v, 1)
  )
  insert into public.wa_tasks (conversa_id, titulo, detalhe, dia, tipo, rodada)
  select n.id,
         'Retomar de onde parou',
         'Primeiro toque. Retome sem cobrar: pergunte se ficou alguma dúvida do que foi dito.',
         n.dia, 'follow_up', 1
    from novas n
  on conflict do nothing;
  get diagnostics v_criadas = row_count;

  return query select v_criadas, v_cancel;
end $function$;

create or replace function public.fn_wa_followup_concluir(p_task uuid, p_por uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t          public.wa_tasks%rowtype;
  v_inst     text;
  v_cad      int[];
  v_prox     int;
  v_dia      date;
  v_id       uuid;
  v_titulo   text;
  v_detalhe  text;
begin
  select * into t from public.wa_tasks where id = p_task;
  if not found or t.tipo <> 'follow_up' then return null; end if;

  select c.instancia into v_inst from public.wa_conversas c where c.id = t.conversa_id;
  v_cad := public.fn_wa_cadencia(v_inst);

  update public.wa_tasks
     set feita = true, feita_em = now(), feita_por = coalesce(p_por, feita_por), updated_at = now()
   where id = p_task;

  -- Desligado no meio da régua: a cobrança feita fica registrada, mas a
  -- próxima não nasce. Sem esta linha, desligar só valeria a partir da rodada
  -- seguinte à seguinte.
  if not public.fn_wa_followup_ligado(t.conversa_id) then return null; end if;

  v_prox := coalesce(t.rodada, 1) + 1;
  if v_prox > array_length(v_cad, 1) then
    return null;
  end if;

  v_dia := current_date + greatest(1, v_cad[v_prox] - v_cad[v_prox - 1]);

  /* SEM O NÚMERO DE DIAS ESCRITO NO TEXTO. Ele dizia "Cinco dias." e virou
     mentira no dia em que a régua passou a ser de cada número: a segunda rodada
     pode ser de 3 num e de 10 no outro. Quem mostra o número é a tela, que lê a
     régua em uso; aqui fica só a intenção. */
  v_titulo := case v_prox
    when 2 then 'Tirar o obstáculo'
    when 3 then 'Trazer novidade'
    when 4 then 'Checar se ainda faz sentido'
    when 5 then 'Encerrar ou reabrir'
  end;
  v_detalhe := case v_prox
    when 2 then 'Quem some nesta altura em geral travou em algo concreto. Pergunte o que falta para decidir.'
    when 3 then 'Repetir a mesma pergunta não move. Traga algo novo: um caso parecido, um prazo que mudou.'
    when 4 then 'Pergunte diretamente se o assunto ainda está de pé. Resposta negativa também é resposta.'
    when 5 then 'Última da régua. Deixe a porta aberta e registre o desfecho; depois desta, o lead sai da cadência.'
  end;

  insert into public.wa_tasks (conversa_id, titulo, detalhe, dia, tipo, rodada)
       values (t.conversa_id, v_titulo, v_detalhe, v_dia, 'follow_up', v_prox)
    on conflict do nothing
    returning id into v_id;

  return v_id;
end $function$;

/* LIGAR E DESLIGAR O CONTATO, com as cobranças abertas acertadas na mesma
   transação. Fosse só um update na coluna, desligar deixaria viva a cobrança
   que já estava marcada — e a pessoa seria cobrada amanhã depois de alguém
   dizer hoje que não. */
create or replace function public.fn_wa_followup_do_contato(
  p_conversa uuid,
  p_ativo    boolean          -- null devolve a conversa à regra do número
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ligado boolean;
begin
  if not (public.fn_is_admin() or public.tem_modulo('atendimento')) then
    raise exception 'Sem acesso ao atendimento';
  end if;

  update public.wa_conversas set followup_ativo = p_ativo where id = p_conversa;

  v_ligado := public.fn_wa_followup_ligado(p_conversa);

  if not v_ligado then
    update public.wa_tasks
       set cancelada_em = now(), cancelada_motivo = 'follow-up desligado', updated_at = now()
     where conversa_id = p_conversa and tipo = 'follow_up'
       and feita = false and cancelada_em is null;
  end if;

  -- Ligando de volta, a próxima cobrança nasce na varredura seguinte: quem
  -- decide o dia é a última mensagem, e essa conta já existe e é testada.
  return v_ligado;
end $$;

revoke all on function public.fn_wa_followup_do_contato(uuid, boolean) from public;
grant execute on function public.fn_wa_followup_do_contato(uuid, boolean) to authenticated;
