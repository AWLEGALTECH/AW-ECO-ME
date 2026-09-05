-- A ponte @lid → telefone passa a ser aprendida AO ABRIR A CONVERSA.
--
-- A regra anterior dependia de a Evolution mandar um `contacts.update` com o
-- lid junto de uma mensagem. Ela manda — mas só às vezes, quando o registro do
-- contato muda por algum motivo dela. Na prática aprendeu o Luan e não aprendeu
-- o João: a presença dele chegava certinha, com o lid 103242474229877, e morria
-- sem dono. O aprendizado dependia de um evento que não é garantido, e "às
-- vezes funciona" numa tela de atendimento é pior que não funcionar, porque
-- ninguém sabe de quem confiar.
--
-- O NOVO GATILHO É UMA COISA QUE SEMPRE ACONTECE: alguém abre a conversa. A
-- tela já avisa o servidor quando isso ocorre (é o mesmo caminho que tentava
-- assinar a presença), e a partir de agora esse aviso carimba a conversa. Aí a
-- primeira presença de lid desconhecido que chegar é daquela conversa — porque
-- o WhatsApp só manda presença de quem se está olhando.
--
-- A REGRA CONTINUA ESTREITA: só vincula se houver EXATAMENTE UMA conversa
-- espiada nos últimos noventa segundos. Duas pessoas com o atendimento aberto
-- em conversas diferentes? Não aprende nada, e a presença não aparece. Vínculo
-- errado mostraria "digitando" no nome errado, e quem lê a tela decide se
-- insiste com o cliente em cima disso.

alter table public.wa_conversas
  add column if not exists presenca_pedida_em timestamptz;

comment on column public.wa_conversas.presenca_pedida_em is
  'Quando a tela abriu esta conversa pela ultima vez. Serve de ancora para aprender o @lid do contato: a presenca que chegar logo depois e desta conversa.';

/**
 * Aprende o par lid ↔ telefone, se e somente se não houver dúvida.
 *
 * Duas âncoras, nesta ordem:
 *   1. a conversa que a tela acabou de abrir  (forte — é o gatilho da presença)
 *   2. a conversa que acabou de se mexer      (fraco — sobrou do jeito antigo)
 *
 * Devolve o telefone vinculado, ou null quando não deu pra decidir. Null aqui
 * significa "não sei", nunca "não existe": a tela fica calada.
 */
create or replace function public.fn_wa_aprender_lid(p_instancia text, p_lid text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tel text;
  v_qtd int;
begin
  if p_lid is null or p_lid = '' or p_instancia is null then
    return null;
  end if;

  -- Já sabido? Devolve e não mexe. Vínculo aprendido não se reescreve sozinho:
  -- se aprendeu errado, o conserto é manual — não quero uma regra frouxa se
  -- corrigindo sozinha para outro erro.
  select telefone into v_tel
    from public.wa_lids
   where instancia = p_instancia and lid = p_lid;
  if found then
    return v_tel;
  end if;

  -- Âncora forte: a conversa aberta na tela agora.
  select count(*), min(telefone) into v_qtd, v_tel
    from public.wa_conversas
   where instancia = p_instancia
     and presenca_pedida_em > now() - interval '90 seconds';

  -- Âncora fraca: quem se mexeu agora. Só quando a forte não decidiu.
  if v_qtd <> 1 then
    select count(*), min(telefone) into v_qtd, v_tel
      from public.wa_conversas
     where instancia = p_instancia
       and ultima_em > now() - interval '20 seconds';
  end if;

  if v_qtd <> 1 or v_tel is null then
    return null;
  end if;

  -- Um telefone não pode ganhar dois lids nem um lid dois telefones. Se já
  -- existe vínculo para esse telefone, não inventa outro: seria a mesma pessoa
  -- com duas identidades, e a presença passaria a piscar entre as duas.
  if exists (select 1 from public.wa_lids
              where instancia = p_instancia and telefone = v_tel) then
    return null;
  end if;

  insert into public.wa_lids (instancia, lid, telefone)
       values (p_instancia, p_lid, v_tel)
  on conflict (instancia, lid) do nothing;

  return v_tel;
end $$;

/**
 * O gatilho passa a aprender TAMBÉM pela própria presença.
 *
 * É o evento que sempre chega — foi só ele que apareceu para o João. Se o lid
 * é desconhecido e há exatamente uma conversa espiada, aprende ali mesmo e já
 * grava a presença; senão descarta em silêncio, como antes.
 */
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

  if new.evento like 'presence%' then
    v_lid := lower(coalesce(new.corpo->>'id', new.corpo->>'remoteJid', ''));
    if v_lid = '' then return null; end if;

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

    if v_lid like '%@lid' then
      -- aprende na hora, se der; devolve null quando há dúvida
      v_tel := public.fn_wa_aprender_lid(new.instancia, v_lid);
    else
      v_tel := public.fn_wa_canonico(split_part(v_lid, '@', 1));
    end if;
    if v_tel is null or v_tel = '' then return null; end if;

    perform public.fn_wa_presenca(new.instancia, v_tel, v_presenca);
  end if;

  return null;
end $$;
