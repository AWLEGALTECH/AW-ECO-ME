-- Ajuste de copy do Balanço diário: "...é de R$ x e em cumprimento de sentença
-- temos R$ y."
create or replace function public.fn_bom_dia_ajuizado()
returns void language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_cumpr numeric;
begin
  select coalesce(sum(valor_causa), 0) into v_total
    from public.processos where fase_processual is distinct from 'ARQUIVADO';

  select coalesce(sum(coalesce(eval, sval)) filter (where fase = 'Cumprimento de sentença'), 0)
    into v_cumpr
  from (
    select
      (select e->>'titulo' from jsonb_array_elements(p.linha_temporal) e where e->>'status'='atual' limit 1) as fase,
      (select (e->'execucao'->>'valor')::numeric from jsonb_array_elements(p.linha_temporal) e where e->>'titulo'='Cumprimento de sentença' limit 1) as eval,
      (select (e->'sentenca'->>'valor')::numeric  from jsonb_array_elements(p.linha_temporal) e where e->>'titulo'='Sentença' limit 1) as sval
    from public.processos p where p.linha_temporal is not null
  ) d;

  perform public.fn_criar_notificacao(
    'bom_dia', 'Balanço diário 📈',
    'Bom dia, nosso valor total em processos ajuizados é de ' || public.fn_fmt_brl(v_total)
      || ' e em cumprimento de sentença temos ' || public.fn_fmt_brl(v_cumpr) || '.',
    jsonb_build_object('valor_total', v_total, 'valor_cumprimento', v_cumpr),
    '/dashboard', null, null);
  perform public.fn_balanco_comercial();
end; $$;
