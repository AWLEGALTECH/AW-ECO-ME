-- Corrige "só uma notificação chega": o Balanço diário e o Balanço comercial
-- nasciam no MESMO instante (10:00:00), e o Web Push (sobretudo no iOS PWA)
-- descarta um push quando dois chegam colados — mesmo com `tag` diferente.
-- Solução: separar em dois cron jobs, com 2 min de diferença, pra cada push
-- chegar isolado no aparelho.

-- 1) bom_dia volta a inserir SÓ o valor ajuizado (deixa de chamar o comercial).
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
end; $$;

-- 2) Comercial ganha o próprio agendamento, 2 min depois do valor ajuizado.
--    10:02 UTC = 06:02 America/Manaus (UTC-4).
do $$ begin
  perform cron.unschedule('balanco-comercial');
exception when others then null;
end $$;

select cron.schedule('balanco-comercial', '2 10 * * *', $$select public.fn_balanco_comercial();$$);
