-- {saudacao}: BOM DIA, BOA TARDE OU BOA NOITE, NA HORA EM QUE A MENSAGEM SAI.
--
-- A recepção abre com "{saudacao}, {nome}, vi no formulário que…". A saudação
-- é calculada sobre `p_quando`, o horário em que a mensagem vai SAIR, e não
-- sobre o horário em que o lead chegou: um lead que preenche às 3 da manhã e
-- recebe às 8, quando a faixa abre, ganha "Bom dia". Calcular na chegada daria
-- "Boa noite" numa mensagem lida no café da manhã.
--
-- As faixas são as combinadas: 4h às 12h dia, 12h às 18h tarde, 18h às 4h
-- noite. O fuso é o do número (wa_atendimento_config.fuso); sem configuração,
-- o do escritório.
create or replace function public.fn_wa_texto_variaveis(p_conversa uuid, p_texto text, p_quando timestamp with time zone)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  t        text := coalesce(p_texto, '');
  v_nome   text;
  v_hora   text;
  v_inst   text;
  v_lead   uuid;
  r        record;
  v_chave  text;
  v_fuso   text;
  v_h      int;
begin
  if t = '' then return t; end if;

  select c.instancia,
         split_part(
           btrim(regexp_replace(
             coalesce(nullif(btrim(c.nome_real), ''), c.nome_wa, ''),
             '^(dr|dra|sr|sra|exmo|exma|prof|profa)\.?\s+', '', 'i')),
           ' ', 1)
    into v_inst, v_nome
    from public.wa_conversas c where c.id = p_conversa;

  if position('{saudacao}' in t) > 0 then
    select cfg.fuso into v_fuso from public.wa_atendimento_config cfg where cfg.instancia = v_inst;
    v_h := extract(hour from (coalesce(p_quando, now()) at time zone coalesce(v_fuso, 'America/Manaus')));
    t := replace(t, '{saudacao}',
      case when v_h >= 4  and v_h < 12 then 'Bom dia'
           when v_h >= 12 and v_h < 18 then 'Boa tarde'
           else 'Boa noite' end);
  end if;

  if position('{horario}' in t) > 0 then
    select to_char(x.quando at time zone cfg.fuso, 'HH24:MI') into v_hora
      from public.fn_wa_proxima_faixa(v_inst, p_quando, 'atendimento') x
      join public.wa_atendimento_config cfg on cfg.instancia = v_inst
     limit 1;
    t := replace(t, '{horario}', coalesce(v_hora, 'em breve'));
  end if;

  if coalesce(v_nome, '') = '' then
    t := regexp_replace(t, '[,\s]*\{nome\}', '', 'g');
  else
    t := replace(t, '{nome}', v_nome);
  end if;

  if position('{' in t) > 0 then
    v_lead := public.fn_wa_automacao_lead(p_conversa);
    if v_lead is not null then
      for r in
        select kv.key, kv.value
          from public.leads_brutos b, jsonb_each_text(coalesce(b.bruto, '{}'::jsonb)) kv
         where b.id = v_lead
      loop
        if position('{' || r.key || '}' in t) = 0 then continue; end if;
        v_chave := regexp_replace(r.key, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g');
        if coalesce(btrim(r.value), '') = '' then
          t := regexp_replace(t, '[,\s]*\{' || v_chave || '\}', '', 'g');
        else
          t := regexp_replace(t, '\{' || v_chave || '\}', replace(btrim(r.value), '\', '\\'), 'g');
        end if;
      end loop;
    end if;

    t := regexp_replace(t, '[,\s]*\{[^{}' || chr(10) || ']{1,80}\}', '', 'g');
  end if;

  return btrim(regexp_replace(t, '[ \t]{2,}', ' ', 'g'));
end $function$;
