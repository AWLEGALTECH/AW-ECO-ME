-- Troféu de fim de mês vai ao ar para TODO o time (deixa de ser ensaio
-- exclusivo do Luan). Passa a usar o fluxo padrão de notificação (sininho +
-- Web Push), agendado para o último dia de cada mês às 21:00 UTC (17:00 Manaus).

-- 1) Tipo da notificação (mandatório, não aparece nas prefs do usuário).
insert into public.notificacao_config (tipo, label, ativo, visivel_usuarios)
values ('trofeu_mes', 'Troféu de fim de mês', true, false)
on conflict (tipo) do update set ativo = true, label = excluded.label;

-- 2) Todo o time recebe.
insert into public.notificacao_user_prefs (user_id, tipo, permitido)
select id, 'trofeu_mes', true from public.profiles
on conflict (user_id, tipo) do update set permitido = true;

-- 3) A função agora cria a notificação padrão (sininho + push pra todos).
create or replace function public.fn_trofeu_fim_mes(p_ref date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rubricas int;
  v_valor numeric;
  v_mes text;
  v_titulo text;
  v_corpo text;
begin
  select coalesce(sum(coalesce(array_length(rubricas, 1), 0)), 0) into v_rubricas
    from public.fechamentos
    where date_trunc('month', data) = date_trunc('month', p_ref);

  select coalesce(sum(valor_causa), 0) into v_valor
    from public.processos
    where date_trunc('month', created_at) = date_trunc('month', p_ref)
      and fase_processual is distinct from 'ARQUIVADO';

  v_mes := (array['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
                  'Agosto','Setembro','Outubro','Novembro','Dezembro'])[extract(month from p_ref)::int];

  v_titulo := '🏆 Fechamento de ' || v_mes;
  v_corpo := 'Parabéns, time! ' || v_rubricas || ' novas rúbricas ajuizáveis e ' || public.fn_fmt_brl(v_valor)
             || ' em valor ajuizado no mês.';

  perform public.fn_criar_notificacao(
    'trofeu_mes', v_titulo, v_corpo,
    jsonb_build_object('rubricas', v_rubricas, 'valor', v_valor),
    '/fechamentos', null, null);

  return jsonb_build_object('rubricas', v_rubricas, 'valor', v_valor, 'titulo', v_titulo, 'corpo', v_corpo);
end;
$$;

-- 4) Wrapper do cron: roda todo dia, mas só dispara no ÚLTIMO dia do mês
--    (quando amanhã é dia 1).
create or replace function public.fn_trofeu_cron()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if extract(day from (current_date + interval '1 day'))::int = 1 then
    perform public.fn_trofeu_fim_mes();
  end if;
end;
$$;

-- 5) Agenda: todo dia às 21:00 UTC (= 17:00 America/Manaus, UTC-4). A trava do
--    wrapper garante que só dispara no último dia do mês.
do $$ begin
  perform cron.unschedule('trofeu-fim-mes');
exception when others then null;
end $$;

select cron.schedule('trofeu-fim-mes', '0 21 * * *', $$select public.fn_trofeu_cron();$$);
