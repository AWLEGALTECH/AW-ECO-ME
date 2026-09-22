-- O SELO "EM CONFLITO" TEM QUE APAGAR SOZINHO.
--
-- A regra anterior só limpava `conflito_desde` quando chegava um `open` dez
-- minutos depois da última queda 440. Mas quando a briga acaba porque alguém
-- saiu da sessão no celular e pareou de novo, ou porque o loop simplesmente
-- morreu, pode não chegar evento nenhum por muito tempo: o número fica
-- saudável e a tela continua dizendo "em conflito". Foi o que aconteceu com o
-- PORTAL DIREITO ABERTO 2 às 20:16 de 21/09.
--
-- Agora o conflito é definido pela RECÊNCIA da última queda 440: vale enquanto
-- a última for de menos de dez minutos atrás. A função limpa em qualquer
-- evento que chegue depois disso, e a tela e as funções que consultam usam a
-- mesma regra de dez minutos, para o selo apagar mesmo em silêncio.

create or replace function public.fn_wa_conexao(
  p_instancia text, p_state text, p_status_reason int
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nome text;
  v_conflito timestamptz;
  v_ultima_440 timestamptz;
  v_estado text := lower(coalesce(p_state, ''));
  v_status text;
  v_quedas int := 0;
begin
  select nome, conflito_desde, ultima_queda_440_em
    into v_nome, v_conflito, v_ultima_440
    from public.wa_instancias
   where lower(trim(nome)) = lower(trim(p_instancia));
  if v_nome is null then
    return jsonb_build_object('ignorada', true);
  end if;

  v_status := case v_estado
    when 'open' then 'conectado'
    when 'connecting' then 'conectando'
    when 'close' then 'desconectado'
    else null end;

  if p_status_reason = 440 then
    select count(*) into v_quedas
      from public.wa_eventos
     where instancia = p_instancia
       and evento = 'connection.update'
       and corpo->>'statusReason' = '440'
       and criado_em > now() - interval '3 minutes';
    v_ultima_440 := now();
    if v_quedas >= 3 and v_conflito is null then
      v_conflito := now();
    end if;
  elsif v_conflito is not null
        and (v_ultima_440 is null or v_ultima_440 < now() - interval '10 minutes') then
    -- Dez minutos sem ninguém derrubar: a briga acabou, seja qual for o evento.
    v_conflito := null;
  end if;

  update public.wa_instancias
     set status = coalesce(v_status, status),
         conflito_desde = v_conflito,
         ultima_queda_440_em = v_ultima_440,
         sincronizado_em = now()
   where nome = v_nome;

  return jsonb_build_object(
    'status', v_status, 'conflito_desde', v_conflito, 'quedas_440_3min', v_quedas
  );
end $$;

/** A pergunta que a tela e as funções fazem: este número está em conflito AGORA? */
create or replace function public.fn_wa_em_conflito(p_nome text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select conflito_desde is not null
        and ultima_queda_440_em is not null
        and ultima_queda_440_em > now() - interval '10 minutes'
       from public.wa_instancias where nome = p_nome),
    false);
$$;

-- Limpa agora o que já venceu, para a tela não esperar o próximo evento.
update public.wa_instancias
   set conflito_desde = null
 where conflito_desde is not null
   and (ultima_queda_440_em is null or ultima_queda_440_em < now() - interval '10 minutes');
