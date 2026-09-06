-- A CENTRAL DE FOLLOW-UP.
--
-- Substitui uma planilha que calculava ao contrário: "hoje é dia X, então quem
-- leva o UP03 é quem entrou em X−15" — e alguém procurava essas pessoas à mão,
-- uma a uma, no chat. O trabalho todo era ACHAR QUEM.
--
-- O QUE MUDA DE FUNDO: a cobrança deixa de ser CALCULADA e passa a ser
-- REGISTRADA. Hoje a tela deduz "esse lead está parado há 12 dias, logo devia
-- ter levado três cobranças" — e essa conta não sabe o que foi realmente feito,
-- não sabe quem fez, e some quando alguém responde. Uma task de verdade sabe.
--
-- AS TRÊS REGRAS, e o porquê de cada uma:
--
-- 1. O RELÓGIO COMEÇA NO SILÊNCIO. A planilha conta do primeiro contato porque
--    o chat dela não dá outra âncora. Aqui a âncora é o dia da nossa última
--    mensagem sem resposta — senão quem conversou três semanas e sumiu ONTEM
--    cairia direto na cobrança escrita para quem sumiu há dois meses.
--
-- 2. ENTRA QUEM FICOU SEM RESPOSTA DEPOIS DE FALARMOS. Lead que ESCREVEU e não
--    foi respondido é o contrário disso: é falha nossa, urgência de hoje. As
--    duas se parecem na fila e são opostas; juntá-las faria a urgente sumir
--    embaixo da rotina.
--
-- 3. UMA TASK ABERTA POR VEZ. Criar as cinco de uma vez encheria a fila de
--    trabalho futuro que ninguém pode fazer hoje. Concluir uma cria a próxima,
--    contada do dia em que foi FEITA — cobrança atrasada não pode empurrar a
--    seguinte pro dia seguinte.

alter table public.wa_tasks
  add column if not exists tipo    text not null default 'lembrete',
  add column if not exists rodada  int;

do $$ begin
  alter table public.wa_tasks
    add constraint wa_tasks_tipo_check check (tipo in ('lembrete', 'follow_up'));
exception when duplicate_object then null; end $$;

comment on column public.wa_tasks.tipo is
  'lembrete = alguem marcou a mao; follow_up = cobranca da cadencia, criada pelo sistema.';
comment on column public.wa_tasks.rodada is
  'So no follow_up: qual passo da regua (1..5). Null nos lembretes.';

-- Uma cobranca aberta por conversa. O indice e o que garante isso mesmo se
-- duas abas chamarem a sincronizacao no mesmo segundo — regra de negocio que
-- depende de ninguem clicar duas vezes nao e regra, e esperanca.
create unique index if not exists wa_tasks_um_followup_aberto
  on public.wa_tasks (conversa_id)
  where tipo = 'follow_up' and feita = false;

/**
 * A régua, no banco. Espelha src/lib/followUp.ts, que tem os testes.
 * Dias desde o silêncio em que cada cobrança vence.
 */
create or replace function public.fn_wa_cadencia()
returns int[] language sql immutable as $$ select array[1, 5, 15, 30, 60] $$;

/**
 * Cria e cancela as cobranças da cadência. Idempotente: rodar duas vezes
 * seguidas não muda nada na segunda.
 *
 * Devolve quantas criou e quantas cancelou, porque "rodou e não fez nada" e
 * "rodou e criou sete" precisam ser distinguíveis de fora — do contrário a
 * única forma de saber se funcionou é ir conferir na tela.
 */
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
  -- ── CANCELA o que deixou de fazer sentido ──
  -- O lead respondeu, fechou, ou foi arquivado. Deixar a cobranca aberta faria
  -- alguem cobrar quem ja respondeu, que e a pior mensagem possivel.
  with mortas as (
    select t.id
      from public.wa_tasks t
      join public.wa_conversas c on c.id = t.conversa_id
     where t.tipo = 'follow_up' and t.feita = false
       and (p_instancia is null or c.instancia ilike p_instancia)
       and (
            c.arquivada
         or c.etapa = 'fechado'
         -- respondeu: a ultima mensagem da conversa veio dele
         or (select m.direcao from public.wa_mensagens m
              where m.conversa_id = c.id
              order by m.criada_em desc limit 1) = 'entrada'
       )
  )
  delete from public.wa_tasks t using mortas m where t.id = m.id;
  get diagnostics v_cancel = row_count;

  -- ── CRIA a primeira cobranca de quem acabou de silenciar ──
  with elegiveis as (
    select c.id,
           c.nome_wa,
           c.telefone,
           (select m.criada_em from public.wa_mensagens m
             where m.conversa_id = c.id order by m.criada_em desc limit 1) as ultima_em,
           (select m.direcao   from public.wa_mensagens m
             where m.conversa_id = c.id order by m.criada_em desc limit 1) as ultima_direcao
      from public.wa_conversas c
     where not c.arquivada
       and coalesce(c.etapa, 'chegou') <> 'fechado'
       and (p_instancia is null or c.instancia ilike p_instancia)
       and not exists (
             select 1 from public.wa_tasks t
              where t.conversa_id = c.id and t.tipo = 'follow_up' and t.feita = false
           )
  ),
  novas as (
    select e.id, (e.ultima_em::date + v_cad[1]) as dia
      from elegiveis e
     where e.ultima_direcao = 'saida'
       and e.ultima_em is not null
       -- Ja passou pela regua inteira? Entao a cadencia acabou pra essa
       -- conversa, e recomecar do zero seria persegui-la para sempre.
       and (select count(*) from public.wa_tasks t
             where t.conversa_id = e.id and t.tipo = 'follow_up' and t.feita)
           < array_length(v_cad, 1)
  )
  insert into public.wa_tasks (conversa_id, titulo, detalhe, dia, tipo, rodada)
  select n.id,
         '1º follow-up — retomar',
         'Um dia sem resposta. Retome de onde parou, sem cobrar: pergunte se ficou alguma dúvida do que foi dito.',
         n.dia, 'follow_up', 1
    from novas n
  on conflict do nothing;
  get diagnostics v_criadas = row_count;

  return query select v_criadas, v_cancel;
end $$;

/**
 * Concluir uma cobrança abre a próxima.
 *
 * O intervalo é a diferença entre dois degraus da régua, contada do dia em que
 * a cobrança foi REALMENTE feita. Contada do calendário original, uma cobrança
 * atrasada empurraria a seguinte pro mesmo dia e a régua desabaria numa tarde.
 *
 * Depois do último degrau não há próxima: o lead sai da cadência, e a conversa
 * fica com as cinco tentativas registradas — que é o desfecho, não um sumiço.
 */
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
    return null;                       -- fim da régua: sai da cadência
  end if;

  v_dia := current_date + (v_cad[v_prox] - v_cad[v_prox - 1]);

  v_titulo := case v_prox
    when 2 then '2º follow-up — tirar o obstáculo'
    when 3 then '3º follow-up — trazer novidade'
    when 4 then '4º follow-up — checar se ainda faz sentido'
    when 5 then '5º follow-up — encerrar ou reabrir'
  end;
  v_detalhe := case v_prox
    when 2 then 'Cinco dias. Quem some nessa altura em geral travou em algo concreto. Pergunte o que falta para decidir.'
    when 3 then 'Quinze dias. Repetir a mesma pergunta não move. Traga algo novo: um caso parecido, um prazo que mudou.'
    when 4 then 'Trinta dias. Pergunte diretamente se o assunto ainda está de pé — resposta negativa também é resposta.'
    when 5 then 'Sessenta dias. Última da régua. Deixe a porta aberta e registre o desfecho; depois desta, o lead sai da cadência.'
  end;

  insert into public.wa_tasks (conversa_id, titulo, detalhe, dia, tipo, rodada)
       values (t.conversa_id, v_titulo, v_detalhe, v_dia, 'follow_up', v_prox)
    on conflict do nothing
    returning id into v_id;

  return v_id;
end $$;
