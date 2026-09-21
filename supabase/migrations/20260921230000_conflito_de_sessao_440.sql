-- CONFLITO DE SESSÃO (440): quando dois sockets do MESMO número brigam.
--
-- O que aconteceu em 21/09, lido no wa_eventos: a troca de foto do PORTAL
-- DIREITO ABERTO 2 fez a Evolution recriar o socket do WhatsApp sem fechar o
-- velho. Os dois têm a mesma credencial, e o WhatsApp derruba um quando o
-- outro entra: `close` com `statusReason 440` ("conexão substituída"), e cada
-- queda dispara outra reconexão. Deu um loop de ~100 eventos por minuto que
-- durou horas, com o painel dizendo "conectado" (o estado declarado é o do
-- último `open`) e nenhum envio saindo ("Connection Closed"). O `instance/
-- restart` faz a mesma coisa e reacendeu a briga às 17:51.
--
-- Até aqui o webhook IGNORAVA `connection.update` ("evento sem tratamento"), e
-- o status da tela vinha só da sincronização com o fetchInstances, que no meio
-- do loop diz "open" na maior parte do tempo. Ou seja: a tela não tinha como
-- saber. Esta migration dá a ela como saber:
--
--   * `conflito_desde`: preenchido quando chegam 3 ou mais quedas 440 em três
--     minutos; limpo quando o número abre e fica 10 minutos sem 440.
--   * `ultima_queda_440_em`: o carimbo que sustenta a regra acima.
--   * `fn_wa_conexao`: o que o webhook chama a cada `connection.update`, e que
--     também passa a manter `status` em tempo real (open/connecting/close).
--
-- E a retenção do wa_eventos ganha um teto próprio para `connection.update`:
-- o loop gerava 2000 linhas a cada vinte minutos e empurrava para fora TODO o
-- resto (mensagens, presença) das outras instâncias, apagando a prova no
-- momento em que ela era necessária. 500 quedas de conexão são mais que o
-- bastante para ver o padrão; as outras 1500 linhas ficam para o que importa.

alter table public.wa_instancias
  add column if not exists conflito_desde timestamptz,
  add column if not exists ultima_queda_440_em timestamptz;

comment on column public.wa_instancias.conflito_desde is
  'Desde quando duas sessões deste número se derrubam na Evolution (statusReason 440). Null = sem conflito.';

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
  -- Só número da lista daqui; a Evolution é compartilhada.
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
    -- O webhook grava a linha em wa_eventos ANTES de chamar aqui, então a
    -- contagem já inclui esta queda.
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
  elsif v_estado = 'open' and v_conflito is not null
        and (v_ultima_440 is null or v_ultima_440 < now() - interval '10 minutes') then
    -- Abriu e ficou dez minutos sem ninguém derrubar: a briga acabou.
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

create or replace function public.fn_wa_eventos_apara()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Teto próprio para queda de conexão: 500 bastam para ver o padrão, e um
  -- loop de reconexão não pode apagar as mensagens e presenças dos outros.
  delete from public.wa_eventos
   where evento = 'connection.update'
     and id < (select max(id) - 500 from public.wa_eventos where evento = 'connection.update');
  delete from public.wa_eventos
   where id < (select max(id) - 2000 from public.wa_eventos);
  return null;
end $function$;
