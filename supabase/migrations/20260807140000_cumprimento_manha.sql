-- Terceira notificação da manhã: valor em CUMPRIMENTO DE SENTENÇA (dinheiro
-- quase certo). Chega junto do "bom dia" e do "balanço comercial", no mesmo cron
-- (10:00 UTC = 06:00 GMT-4). Mesmo público das outras (admin + Diego + Matheus;
-- Adria fica de fora).

-- 1. Tipo + config (só admin vê no sino; push vai por prefs).
insert into public.notificacao_config (tipo, label, ativo, visivel_usuarios) values
  ('cumprimento_manha', 'Cumprimento de sentença (diário)', true, false)
on conflict (tipo) do nothing;

-- 2. Mesmo público das da manhã: replica os prefs do bom_dia.
insert into public.notificacao_user_prefs (user_id, tipo, permitido)
select user_id, 'cumprimento_manha', permitido
  from public.notificacao_user_prefs where tipo = 'bom_dia'
on conflict (user_id, tipo) do update set permitido = excluded.permitido;

-- 3. Função: soma o valor dos processos que estão no cumprimento de sentença
--    (valor executado quando houver; senão o valor da sentença).
create or replace function public.fn_cumprimento_manha()
returns void language plpgsql security definer set search_path = public as $$
declare v_n int; v_valor numeric;
begin
  with d as (
    select
      (select e->>'titulo' from jsonb_array_elements(p.linha_temporal) e where e->>'status'='atual' limit 1) as fase,
      (select (e->'execucao'->>'valor')::numeric from jsonb_array_elements(p.linha_temporal) e where e->>'titulo'='Cumprimento de sentença' limit 1) as eval,
      (select (e->'sentenca'->>'valor')::numeric  from jsonb_array_elements(p.linha_temporal) e where e->>'titulo'='Sentença' limit 1) as sval
    from public.processos p where p.linha_temporal is not null
  )
  select count(*) filter (where fase = 'Cumprimento de sentença'),
         coalesce(sum(coalesce(eval, sval)) filter (where fase = 'Cumprimento de sentença'), 0)
    into v_n, v_valor from d;

  perform public.fn_criar_notificacao(
    'cumprimento_manha', 'Cumprimento de sentença 💰',
    'Bom dia! Temos ' || public.fn_fmt_brl(v_valor) || ' quase certos em ' || v_n ||
      case when v_n = 1 then ' processo' else ' processos' end ||
      ' no cumprimento de sentença — dinheiro que já venceu e caminha pro recebimento.',
    jsonb_build_object('valor_cumprimento', v_valor, 'n_cumprimento', v_n),
    '/tracker', null, null);
end; $$;

-- 4. Dispara junto das outras duas na rotina da manhã.
create or replace function public.fn_bom_dia_ajuizado()
returns void language plpgsql security definer set search_path = public as $$
declare v_total numeric;
begin
  select coalesce(sum(valor_causa), 0) into v_total
    from public.processos where fase_processual is distinct from 'ARQUIVADO';
  perform public.fn_criar_notificacao(
    'bom_dia', 'Balanço diário 📈',
    'Bom dia, nosso valor total em processos ajuizados é de ' || public.fn_fmt_brl(v_total) || '.',
    jsonb_build_object('valor_total', v_total),
    '/dashboard', null, null);
  perform public.fn_balanco_comercial();
  perform public.fn_cumprimento_manha();
end; $$;
