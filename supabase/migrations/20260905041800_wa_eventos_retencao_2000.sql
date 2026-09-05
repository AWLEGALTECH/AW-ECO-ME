-- wa_eventos: a retenção sobe de 200 para 2000 linhas.
--
-- A tabela nasceu pequena porque era diagnóstico pontual: quatro eventos
-- tratados, algumas dezenas de linhas por dia. Mas ela virou o único
-- instrumento confiável desta integração, e agora vai receber a lista COMPLETA
-- de eventos da Evolution — inclusive `contacts.set`, que despeja mil e
-- setecentos contatos de uma vez na conexão.
--
-- Com o teto em 200, uma enxurrada dessas empurra pra fora justamente a linha
-- que se estava tentando capturar. O instrumento apagaria a medição no momento
-- em que ela acontece, e o sintoma seria "não chegou" — a mesma ausência
-- enganosa que já custou três diagnósticos errados aqui.
--
-- 2000 linhas de jsonb é barato; perder a única amostra do formato que a gente
-- precisa ler, não.

create or replace function public.fn_wa_eventos_apara()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.wa_eventos
   where id < (select max(id) - 2000 from public.wa_eventos);
  return null;
end $function$;
