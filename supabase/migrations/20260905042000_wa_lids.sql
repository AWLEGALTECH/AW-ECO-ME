-- A PONTE @lid → TELEFONE.
--
-- O WhatsApp novo identifica contato por LinkedID. A presença ("digitando",
-- "online", "visto por último") chega SÓ com o lid — `33393538515133@lid` — e o
-- lid não tem nenhuma relação com o telefone: não dá pra derivar, converter nem
-- adivinhar. Sem a ponte, o evento chega e não tem onde pousar.
--
-- E A EVOLUTION 2.3.7 NÃO DÁ ESSA PONTE. Perguntada direto, ela responde
-- `{"jid":"559293000259@s.whatsapp.net","name":"Luan Ásaf","lid":"lid"}` — o
-- campo `lid` vem com o valor literal "lid", um campo que ficou pela metade
-- nessa build. O `findContacts` não traz lid nenhum.
--
-- O QUE ELA DÁ é o mesmo contato atualizado DUAS VEZES, meio segundo depois de
-- uma mensagem, uma vez sob cada identidade:
--
--   04:18:27.485  contacts.update   pushName "Luan Ásaf"  559293000259@s.whatsapp.net
--   04:18:28.004  chats.update                            33393538515133@lid
--   04:18:28.051  contacts.update                         33393538515133@lid
--
-- Então a ponte se aprende por COINCIDÊNCIA NO TEMPO. E coincidência é frágil,
-- por isso a regra é estreita de propósito: só vincula quando UMA ÚNICA
-- conversa daquela instância se mexeu nos últimos 20 segundos. Duas pessoas
-- escrevendo ao mesmo tempo? Não vincula nenhuma, e a presença continua não
-- aparecendo — que é o comportamento certo. Vínculo errado seria mostrar
-- "digitando" no nome errado, e isso é pior do que não mostrar nada: quem lê a
-- tela decide se insiste com o cliente com base nisso.
--
-- O vínculo, uma vez feito, NÃO é sobrescrito. Se aprendeu errado, é conserto
-- manual — não quero uma regra frouxa se corrigindo sozinha pra outro erro.

create table if not exists public.wa_lids (
  instancia   text not null,
  lid         text not null,
  telefone    text not null,
  criado_em   timestamptz not null default now(),
  primary key (instancia, lid)
);

comment on table public.wa_lids is
  'Ponte entre o LinkedID (@lid) do WhatsApp e o telefone. A presença chega só com o lid, e a Evolution 2.3.7 não devolve esse par — ele é aprendido por coincidência no tempo, e só quando não há ambiguidade.';

create index if not exists wa_lids_telefone_idx on public.wa_lids (instancia, telefone);

alter table public.wa_lids enable row level security;

-- Só quem cuida do atendimento lê; ninguém escreve pela API (quem escreve é a
-- webhook, com service role).
drop policy if exists wa_lids_leitura on public.wa_lids;
create policy wa_lids_leitura on public.wa_lids
  for select using (public.fn_is_admin() or public.tem_modulo('atendimento'));

/**
 * Aprende o par lid ↔ telefone, se e somente se não houver dúvida.
 *
 * Devolve o telefone vinculado, ou null quando não deu pra decidir — e null
 * aqui significa "não sei", nunca "não existe". A tela respeita isso: sem
 * vínculo, a presença simplesmente não aparece.
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

  -- Já sabido? Devolve e não mexe. Vínculo aprendido não se reescreve sozinho.
  select telefone into v_tel
    from public.wa_lids
   where instancia = p_instancia and lid = p_lid;
  if found then
    return v_tel;
  end if;

  -- Quem se mexeu agora nesta instância? Uma só, ou não vincula.
  select count(*), min(telefone) into v_qtd, v_tel
    from public.wa_conversas
   where instancia = p_instancia
     and ultima_em > now() - interval '20 seconds';

  if v_qtd <> 1 or v_tel is null then
    return null;
  end if;

  insert into public.wa_lids (instancia, lid, telefone)
       values (p_instancia, p_lid, v_tel)
  on conflict (instancia, lid) do nothing;

  return v_tel;
end $$;

/** O telefone de um lid já aprendido. Null quando ainda não se sabe. */
create or replace function public.fn_wa_telefone_do_lid(p_instancia text, p_lid text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select telefone from public.wa_lids
   where instancia = p_instancia and lid = p_lid;
$$;
