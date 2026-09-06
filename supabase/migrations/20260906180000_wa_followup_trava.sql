-- DUAS CORREÇÕES NA CADÊNCIA, e as duas são sobre a mesma coisa: o sistema
-- estava decidindo sozinho o que a pessoa não decidiu.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 1. CANCELAR DEIXA DE SER APAGAR.
--
-- A sincronização DELETAVA a cobrança quando o lead respondia. A intenção
-- estava certa (cobrar quem já respondeu é a pior mensagem possível), o meio
-- estava errado: a linha sumia da tela sem rastro, e do lado de quem estava
-- olhando isso é indistinguível de "alguém concluiu sem me avisar" — foi
-- exatamente essa a reclamação.
--
-- Cancelada não é feita e não é aberta: é uma terceira coisa, com data e
-- motivo. A fila não mostra, o histórico guarda, e a pergunta "por que sumiu?"
-- passa a ter resposta.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 2. O ATENDIMENTO FINALIZADO — a trava.
--
-- Hoje a única saída automática da régua é o lead responder. Mas existe uma
-- saída HUMANA que o sistema não tinha: "esse aqui acabou". Cliente que virou
-- processo, pessoa que pediu pra não insistir, caso que morreu por fora do
-- chat. Sem isso, quem sabe que acabou não tem como dizer — e o lead fica na
-- fila para sempre, empurrando a métrica de cobrança pra cima com trabalho que
-- ninguém vai fazer.
--
-- É trava e não etapa: `etapa = 'fechado'` significa VIROU CLIENTE, e "não
-- insiste mais" acontece muito com quem não fechou. Misturar os dois faria a
-- taxa de fechamento subir toda vez que alguém desistisse de um lead.

alter table public.wa_tasks
  add column if not exists cancelada_em     timestamptz,
  add column if not exists cancelada_motivo text;

comment on column public.wa_tasks.cancelada_em is
  'Quando deixou de fazer sentido. Cancelada nao e feita: ninguem cobrou, o motivo da cobranca e que desapareceu.';

alter table public.wa_conversas
  add column if not exists atendimento_finalizado_em  timestamptz,
  add column if not exists atendimento_finalizado_por uuid references auth.users(id);

comment on column public.wa_conversas.atendimento_finalizado_em is
  'Trava manual: sai da cadencia de follow-up e para de contar na metrica. Diferente de etapa=fechado, que significa virou cliente.';

-- O índice único que garante UMA cobrança aberta por conversa precisa ignorar
-- as canceladas — senão uma cancelada velha impediria a próxima de nascer.
drop index if exists public.wa_tasks_um_followup_aberto;
create unique index if not exists wa_tasks_um_followup_aberto
  on public.wa_tasks (conversa_id)
  where tipo = 'follow_up' and feita = false and cancelada_em is null;

/**
 * Cria e cancela as cobranças da cadência. Idempotente.
 *
 * Devolve quantas criou e quantas cancelou, porque "rodou e não fez nada" e
 * "rodou e criou sete" precisam ser distinguíveis de fora.
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
  -- Com motivo escrito: "sumiu" sem explicação é a pior forma de uma tarefa
  -- desaparecer, porque quem estava contando com ela nao sabe se falhou.
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
         -- respondeu: a ultima mensagem da conversa veio dele
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

  -- ── CRIA a primeira cobranca de quem acabou de silenciar ──
  with elegiveis as (
    select c.id,
           (select m.criada_em from public.wa_mensagens m
             where m.conversa_id = c.id order by m.criada_em desc limit 1) as ultima_em,
           (select m.direcao   from public.wa_mensagens m
             where m.conversa_id = c.id order by m.criada_em desc limit 1) as ultima_direcao
      from public.wa_conversas c
     where not c.arquivada
       and coalesce(c.etapa, 'chegou') <> 'fechado'
       and c.atendimento_finalizado_em is null      -- a trava
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
 * Liga e desliga a trava. Desligar devolve o lead à cadência na próxima
 * sincronização — a régua recomeça do silêncio atual, não de onde parou, que
 * é o certo: o tempo passou e a mensagem de "um dia sem resposta" não serve
 * mais para quem está calado há três semanas.
 */
create or replace function public.fn_wa_atendimento_finalizar(
  p_conversa uuid,
  p_finalizado boolean default true,
  p_por uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_quando timestamptz;
begin
  update public.wa_conversas
     set atendimento_finalizado_em  = case when p_finalizado then now() else null end,
         atendimento_finalizado_por = case when p_finalizado then p_por else null end
   where id = p_conversa
  returning atendimento_finalizado_em into v_quando;

  -- Cancelar aqui e nao esperar a sincronizacao: quem clica "finalizado" espera
  -- a cobranca sumir da fila naquele segundo, e nao no proximo minuto.
  if p_finalizado then
    update public.wa_tasks
       set cancelada_em = now(), cancelada_motivo = 'atendimento finalizado', updated_at = now()
     where conversa_id = p_conversa and tipo = 'follow_up'
       and feita = false and cancelada_em is null;
  end if;

  return v_quando;
end $$;
