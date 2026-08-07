-- Agenda (horário programado) por tipo de notificação, para exibir na central.
-- As diárias/mensais são disparadas por pg_cron em UTC; aqui guardamos o texto
-- já convertido para o fuso de Manaus (UTC-4), que é onde o time está. As
-- notificações de evento (protocolo, pré-cliente, assinatura) não têm horário:
-- ficam com agenda nula e a UI mostra "em tempo real".
alter table public.notificacao_config
  add column if not exists agenda text;

update public.notificacao_config set agenda = 'Todo dia, 06:00 (Manaus)'            where tipo = 'bom_dia';           -- cron 0 10 * * * UTC
update public.notificacao_config set agenda = 'Todo dia, 06:02 (Manaus)'            where tipo = 'balanco_comercial'; -- cron 2 10 * * * UTC
update public.notificacao_config set agenda = 'Último dia do mês, 17:00 (Manaus)'   where tipo = 'trofeu_mes';        -- cron 0 21 * * * UTC
