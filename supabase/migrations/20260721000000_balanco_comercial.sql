-- Balanço comercial diário — chega JUNTO do "valor ajuizado" da manhã.
-- Conteúdo: ticket médio dos processos, número de clientes, número de ações.
-- Mesmo público do bom_dia (admin sempre + quem permitiu; Adria fica de fora).

-- Registra o tipo (fn_criar_notificacao exige config ativa).
insert into public.notificacao_config (tipo, label, ativo, visivel_usuarios) values
  ('balanco_comercial', 'Balanço comercial (diário)', true, false)
on conflict (tipo) do nothing;

-- Mesmo público do bom_dia: replica os prefs por usuário.
insert into public.notificacao_user_prefs (user_id, tipo, permitido)
select user_id, 'balanco_comercial', permitido
  from public.notificacao_user_prefs where tipo = 'bom_dia'
on conflict (user_id, tipo) do update set permitido = excluded.permitido;

-- Função do balanço comercial.
create or replace function public.fn_balanco_comercial()
returns void language plpgsql security definer set search_path = public as $$
declare v_n_acoes int; v_ticket numeric; v_n_clientes int; v_corpo text;
begin
  select count(*), coalesce(avg(valor_causa) filter (where valor_causa is not null), 0)
    into v_n_acoes, v_ticket from public.processos;
  select count(*) into v_n_clientes from public.clientes;
  v_corpo :=
       'Ticket médio dos processos: ' || public.fn_fmt_brl(v_ticket) || E'\n'
    || 'Clientes: ' || v_n_clientes || E'\n'
    || 'Ações ajuizadas: ' || v_n_acoes;
  perform public.fn_criar_notificacao(
    'balanco_comercial', 'Balanço comercial 📊', v_corpo,
    jsonb_build_object('ticket_medio', v_ticket, 'n_clientes', v_n_clientes, 'n_acoes', v_n_acoes),
    '/dashboard', null, null);
end; $$;

-- Passa a disparar junto do valor ajuizado da manhã (mesmo cron às 10:00 UTC).
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
end; $$;
