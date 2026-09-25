-- O GATILHO "MENSAGEM RECEBIDA" APRENDE A RECONHECER UM PÚBLICO.
--
-- A campanha de empresários (empréstimos PJ) não tem landing page: o anúncio
-- da Meta manda direto para o WhatsApp do PDA IN, que é o mesmo número do
-- público do Bradesco. Os dois públicos chegam pela mesma porta, e a recepção
-- precisa separar um do outro logo na primeira mensagem.
--
-- Até aqui o gatilho só sabia "a mensagem contém X", e disparava em QUALQUER
-- mensagem que contivesse, não só na primeira. Agora ele tem três filtros a
-- mais, todos opcionais e todos em `gatilho_config`:
--
--   so_primeira      é a primeira mensagem que este telefone nos manda, em
--                    qualquer número. Quem já conversou antes não é recebido
--                    de novo.
--   fora_das_bases   o telefone não está em base nenhuma (qualquer planilha,
--                    de qualquer número). É o "não é lead do Bradesco".
--   de_anuncio       a mensagem veio de um anúncio da Meta (clique para o
--                    WhatsApp). A Evolution entrega o anúncio junto da
--                    mensagem, em `externalAdReply`, e o webhook já guarda.
--   anuncio_contendo com de_anuncio: só anúncio cujo título ou texto contém
--                    isto.
--
-- E O TEXTO PASSA A SER COMPARADO SEM ACENTO, CAIXA NEM PONTUAÇÃO. "Sou
-- empresario, gostaria de entender mais sobre a analise" é a mesma frase que
-- a do anúncio; com `ilike` não era.
--
-- A RECEPÇÃO SUBSTITUI O PRIMEIRO ATENDIMENTO. O PDA IN tem "Primeiro
-- atendimento" ligado, e ele responde toda primeira mensagem com a fala do
-- Bradesco ("vi que você respondeu nosso formulário... descontos na sua
-- conta"). O primeiro empresário da campanha (25/09, 00:54) recebeu essa fala.
-- Quando um fluxo com `so_primeira` assume a conversa, a conversa é marcada
-- como já atendida, e o gatilho do primeiro atendimento, que roda DEPOIS deste
-- (os gatilhos da mesma tabela rodam em ordem alfabética: automacao_mensagem
-- vem antes de primeiro_atendimento), não manda nada.

-- ── texto comparável ──────────────────────────────────────────────────────
create or replace function public.fn_wa_texto_normal(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(p, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- ── o anúncio de onde a mensagem veio ─────────────────────────────────────
-- Nulo quando não veio de anúncio. O caminho do `externalAdReply` muda de
-- acordo com o tipo da mensagem (texto puro, texto estendido, mídia), por isso
-- a busca em qualquer profundidade.
create or replace function public.fn_wa_anuncio_da_mensagem(p_bruto jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when x is null then null else jsonb_build_object(
    'id',     x->>'sourceId',
    'titulo', x->>'title',
    'texto',  x->>'body',
    'url',    x->>'sourceUrl')
  end
  from (select jsonb_path_query_first(coalesce(p_bruto, '{}'::jsonb), 'strict $.**.externalAdReply') as x) s;
$$;

-- ── o mesmo telefone ──────────────────────────────────────────────────────
-- DDI + DDD e os 8 últimos dígitos. O nono dígito vem e vai entre a planilha,
-- o WhatsApp e a Evolution, e comparar o número inteiro dizia "não está na
-- base" para quem está.
create or replace function public.fn_wa_chave_do_telefone(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when length(d) < 10 then d else left(d, 4) || right(d, 8) end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s;
$$;

create or replace function public.fn_wa_esta_em_base(p_telefone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leads_brutos b
     where b.apagado_em is null
       and public.fn_wa_chave_do_telefone(b.telefone) = public.fn_wa_chave_do_telefone(p_telefone));
$$;

-- ── o gatilho ─────────────────────────────────────────────────────────────
create or replace function public.fn_wa_automacao_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  c record; a record; cfg jsonb;
  v_txt      text;
  v_contendo text;
  v_id       uuid;
  -- calculados só se algum fluxo pedir, e uma vez só
  v_primeira boolean;
  v_em_base  boolean;
  v_anuncio  jsonb;
  v_anuncio_lido boolean := false;
begin
  if new.direcao <> 'entrada' then return new; end if;
  select cv.id, cv.instancia, cv.telefone into c
    from public.wa_conversas cv where cv.id = new.conversa_id;
  if c.id is null then return new; end if;
  v_txt := public.fn_wa_texto_normal(new.texto);

  for a in select * from public.fn_wa_automacoes_de(c.instancia, 'mensagem_recebida') loop
    cfg := coalesce(a.gatilho_config, '{}'::jsonb);

    v_contendo := public.fn_wa_texto_normal(cfg->>'contendo');
    if v_contendo <> '' and position(v_contendo in v_txt) = 0 then continue; end if;

    if coalesce((cfg->>'so_primeira')::boolean, false) then
      if v_primeira is null then
        v_primeira := not exists (
          select 1
            from public.wa_conversas cc
            join public.wa_mensagens m on m.conversa_id = cc.id
           where public.fn_wa_chave_do_telefone(cc.telefone) = public.fn_wa_chave_do_telefone(c.telefone)
             and m.direcao = 'entrada'
             and m.id <> new.id);
      end if;
      if not v_primeira then continue; end if;
    end if;

    if coalesce((cfg->>'fora_das_bases')::boolean, false) then
      if v_em_base is null then v_em_base := public.fn_wa_esta_em_base(c.telefone); end if;
      if v_em_base then continue; end if;
    end if;

    if coalesce((cfg->>'de_anuncio')::boolean, false) then
      if not v_anuncio_lido then
        v_anuncio := public.fn_wa_anuncio_da_mensagem(new.bruto);
        v_anuncio_lido := true;
      end if;
      if v_anuncio is null then continue; end if;
      if public.fn_wa_texto_normal(cfg->>'anuncio_contendo') <> ''
         and position(public.fn_wa_texto_normal(cfg->>'anuncio_contendo')
                      in public.fn_wa_texto_normal(coalesce(v_anuncio->>'titulo', '') || ' ' || coalesce(v_anuncio->>'texto', ''))) = 0 then
        continue;
      end if;
    end if;

    if exists (
      select 1 from public.wa_automacao_execucoes e
       where e.automacao_id = a.id and e.conversa_id = c.id
         and e.status in ('pendente','rodando')
    ) then continue; end if;

    v_id := public.fn_wa_automacao_enfileirar(
      a.id, 'msg:' || new.id::text, c.id, null, c.telefone, now());

    -- a recepção do fluxo vale como primeiro atendimento: a saudação genérica
    -- do número não sai por cima dela
    if v_id is not null and coalesce((cfg->>'so_primeira')::boolean, false) then
      update public.wa_conversas
         set primeiro_atendimento_em = coalesce(primeiro_atendimento_em, now())
       where id = c.id;
    end if;
  end loop;
  return new;
end $function$;
