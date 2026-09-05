-- A presença passa a chegar na tela, resolvida pelo BANCO e não pela função.
--
-- Todo evento da Evolution já cai em `wa_eventos` com o corpo cru — foi essa a
-- decisão de ontem, depois de eu passar horas sem conseguir distinguir "não
-- chegou" de "chegou e a gente descartou". Com o corpo cru na tabela, o resto
-- do trabalho pode acontecer aqui, num gatilho, em vez de dentro da edge
-- function.
--
-- E TEM UM MOTIVO FORTE PRA SER AQUI. Todo deploy da `wa-webhook` pela API de
-- gerenciamento liga o `verify_jwt` sozinho, e com ele ligado o portão do
-- Supabase recusa a Evolution com 401 antes do nosso código acordar — sem log,
-- sem erro visível, a caixa inteira parando. Isso já custou uma noite. Fazendo
-- no banco, o conserto entra sem tocar na função e sem reabrir esse buraco.
--
-- O QUE O GATILHO FAZ, em duas linhas de evento:
--
--   contacts.update / chats.update / contacts.upsert  →  aprende lid ↔ telefone
--   presence.update                                    →  traduz o lid e grava
--
-- A regra de aprendizado é a de `fn_wa_aprender_lid`: só vincula quando não há
-- ambiguidade. Na dúvida não vincula, e a presença simplesmente não aparece —
-- "digitando" no nome errado é pior que nada, porque quem lê a tela decide se
-- insiste com o cliente em cima disso.

create or replace function public.fn_wa_eventos_presenca()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r          jsonb;
  v_lid      text;
  v_tel      text;
  v_bruta    text;
  v_presenca text;
begin
  -- ── aprender a ponte ──
  if new.evento in ('contacts.update', 'chats.update', 'contacts.upsert') then
    for r in
      select case when jsonb_typeof(new.corpo) = 'array'
                  then jsonb_array_elements(new.corpo)
                  else new.corpo end
    loop
      v_lid := lower(coalesce(r->>'remoteJid', r->>'id', ''));
      if v_lid like '%@lid' then
        perform public.fn_wa_aprender_lid(new.instancia, v_lid);
      end if;
    end loop;
    return null;
  end if;

  -- ── traduzir e gravar a presença ──
  if new.evento like 'presence%' then
    v_lid := lower(coalesce(new.corpo->>'id', new.corpo->>'remoteJid', ''));
    if v_lid = '' then return null; end if;

    -- O estado vem aninhado por jid dentro de `presences`.
    select p.value->>'lastKnownPresence'
      into v_bruta
      from jsonb_each(coalesce(new.corpo->'presences', '{}'::jsonb)) p
     limit 1;

    v_presenca := case lower(coalesce(v_bruta, ''))
      when 'available'   then 'disponivel'
      when 'unavailable' then 'indisponivel'
      when 'composing'   then 'digitando'
      when 'recording'   then 'gravando'
      else null end;
    if v_presenca is null then return null; end if;

    -- `@lid` passa pela ponte; o resto é telefone e vai direto.
    if v_lid like '%@lid' then
      v_tel := public.fn_wa_telefone_do_lid(new.instancia, v_lid);
    else
      v_tel := public.fn_wa_canonico(split_part(v_lid, '@', 1));
    end if;
    if v_tel is null or v_tel = '' then return null; end if;

    perform public.fn_wa_presenca(new.instancia, v_tel, v_presenca);
  end if;

  return null;
end $$;

drop trigger if exists tg_wa_eventos_presenca on public.wa_eventos;
create trigger tg_wa_eventos_presenca
  after insert on public.wa_eventos
  for each row execute function public.fn_wa_eventos_presenca();
