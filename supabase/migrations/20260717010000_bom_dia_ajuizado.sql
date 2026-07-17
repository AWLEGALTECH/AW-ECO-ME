-- Mensagem diária "Bom dia" com o valor total ajuizado.
-- Agendada via pg_cron às 10:00 UTC (= 06:00 GMT-4). Só admin recebe
-- (visivel_usuarios=false); a notificação dispara push pelo trigger normal.

insert into public.notificacao_config (tipo, label, ativo, visivel_usuarios) values
  ('bom_dia', 'Bom dia — valor ajuizado (diário)', true, false)
on conflict (tipo) do nothing;

create or replace function public.fn_bom_dia_ajuizado()
returns void language plpgsql security definer set search_path = public as $$
declare v_total numeric;
begin
  -- mesmo cálculo do card "Valor Ajuizado" do dashboard: exclui arquivados
  select coalesce(sum(valor_causa), 0) into v_total
    from public.processos where fase_processual is distinct from 'ARQUIVADO';
  perform public.fn_criar_notificacao(
    'bom_dia', 'Balanço diário 📈',
    'Bom dia, nosso valor total em processos ajuizados é de ' || public.fn_fmt_brl(v_total) || '.',
    jsonb_build_object('valor_total', v_total),
    '/dashboard', null, null);
end; $$;

create extension if not exists pg_cron;

do $$ begin
  perform cron.unschedule('bom-dia-ajuizado');
exception when others then null;
end $$;

select cron.schedule('bom-dia-ajuizado', '0 10 * * *', $$select public.fn_bom_dia_ajuizado();$$);
