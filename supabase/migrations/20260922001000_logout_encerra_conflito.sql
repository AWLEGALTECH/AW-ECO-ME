-- SAIR DA SESSÃO ENCERRA O CONFLITO NA HORA.
--
-- A saída do conflito de sessão (440) é derrubar todas as sessões do número:
-- no celular, WhatsApp, Dispositivos conectados, sair da Evolution. Quando
-- isso acontece, a Evolution manda `close` com `statusReason 401` (loggedOut).
-- Às 00:04 de 22/09 o chefe fez exatamente isso no PORTAL DIREITO ABERTO e o
-- loop parou no mesmo minuto; mas o selo "em conflito" ia ficar aceso por dez
-- minutos, esperando a última queda 440 envelhecer, num número que já estava
-- sendo pareado de novo. Quem acabou de seguir o passo a passo e vê o aviso
-- continuar acha que não funcionou.
--
-- 401 e 403 são as duas razões em que a credencial deixou de existir: não há
-- mais duas sessões, porque não há sessão nenhuma. O conflito acaba ali.

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

  if p_status_reason in (401, 403) then
    -- Saiu da sessão (ou foi barrado): a credencial acabou, e com ela a briga.
    v_conflito := null;
    v_ultima_440 := null;
  elsif p_status_reason = 440 then
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

-- O PORTAL DIREITO ABERTO já recebeu o 401 às 00:04 de 22/09, antes desta
-- regra existir. Encerra o conflito dele agora, para o pareamento novo nascer
-- limpo na tela.
update public.wa_instancias
   set conflito_desde = null, ultima_queda_440_em = null
 where nome in (
   select distinct instancia from public.wa_eventos
    where evento = 'connection.update'
      and corpo->>'statusReason' in ('401', '403')
      and criado_em > now() - interval '1 hour'
 );
