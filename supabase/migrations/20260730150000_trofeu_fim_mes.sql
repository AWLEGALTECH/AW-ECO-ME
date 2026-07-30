-- Troféu de fim de mês (EXCLUSIVO do Luan Ásaf, surpresa).
-- Conta as novas rúbricas do mês (soma dos arrays `rubricas` dos fechamentos) e
-- o valor ajuizado no mês (soma do valor_causa das ações abertas no mês, por
-- data de cadastro, exceto arquivadas). Dispara via edge function send-trofeu,
-- que entrega SÓ para as inscrições do Luan — não passa pelo broadcast de
-- admins e não cria item no sininho.
create or replace function public.fn_trofeu_fim_mes(p_ref date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_luan uuid := '05d5eb4b-1379-4ecc-b679-f77fd63eeebe';
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
  v_corpo := 'Parabéns! ' || v_rubricas || ' novas rúbricas ajuizáveis e ' || public.fn_fmt_brl(v_valor)
             || ' em valor ajuizado no mês. 🎉';

  perform net.http_post(
    url := 'https://wvltdjspytysuoybcfgb.supabase.co/functions/v1/send-trofeu',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bHRkanNweXR5c3VveWJjZmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjAxNjEsImV4cCI6MjA5NDgzNjE2MX0.aTFKemNruwj70C3inSxfmz8DQm38ux9JGlq5GXuGL34',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bHRkanNweXR5c3VveWJjZmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjAxNjEsImV4cCI6MjA5NDgzNjE2MX0.aTFKemNruwj70C3inSxfmz8DQm38ux9JGlq5GXuGL34'
    ),
    body := jsonb_build_object('user_id', v_luan, 'titulo', v_titulo, 'corpo', v_corpo, 'link', '/fechamentos')
  );

  return jsonb_build_object('rubricas', v_rubricas, 'valor', v_valor, 'titulo', v_titulo, 'corpo', v_corpo);
end;
$$;
