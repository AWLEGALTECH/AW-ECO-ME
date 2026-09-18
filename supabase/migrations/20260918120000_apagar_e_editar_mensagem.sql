-- APAGAR E EDITAR MENSAGEM, como no WhatsApp (pedido da Adria, 18/09/2026).
--
-- Vem do AW-ECO, onde as duas já existem e rodam desde 14 e 17/09. Aqui é a
-- mesma regra e o mesmo formato de coluna de propósito: os dois sistemas leem
-- `wa_mensagens` com o mesmo vocabulário, e uma conversa exportada de um lado
-- precisa continuar fazendo sentido no outro.
--
-- SÃO DUAS COISAS DIFERENTES COM O MESMO NOME:
--
--   apagada_em  "para todos". A Evolution revoga no WhatsApp e a mensagem
--               some do aparelho do cliente também. Só vale para mensagem
--               NOSSA e dentro da janela dele (~48 h). A bolha passa a
--               mostrar "Mensagem apagada", igual ao WhatsApp, em vez de
--               desaparecer: a conversa é registro, e buraco no registro é
--               pior que a marca do que saiu dali.
--
--   oculta_em   "para mim". Some só da nossa tela; no WhatsApp do cliente
--               continua lá, inteira. Serve para a mensagem DELE, que não há
--               como revogar, e para limpar ruído do histórico.
--
-- Trocar uma pela outra é o erro caro: alguém acha que apagou no cliente e
-- não apagou. Por isso são duas colunas, e não um `apagada` com um tipo.
--
-- editada_em + texto_original: o WhatsApp deixa editar a própria mensagem de
-- texto em ~15 minutos, e marca a bolha com "editada". Guardamos o texto de
-- antes porque conversa com cliente é registro, e registro não perde versão:
-- se alguém corrige um valor ou um prazo, o que foi dito primeiro continua
-- existindo.

alter table public.wa_mensagens
  add column if not exists apagada_em    timestamptz,
  add column if not exists apagada_por   uuid references auth.users(id) on delete set null,
  add column if not exists oculta_em     timestamptz,
  add column if not exists oculta_por    uuid references auth.users(id) on delete set null,
  add column if not exists editada_em    timestamptz,
  add column if not exists texto_original text;

comment on column public.wa_mensagens.apagada_em is
  'Apagada para todos (revogada no WhatsApp), por nos ou pelo proprio contato.';
comment on column public.wa_mensagens.oculta_em is
  'Apagada so aqui ("para mim"); no WhatsApp do cliente ela continua.';
comment on column public.wa_mensagens.texto_original is
  'O texto ANTES da primeira edicao. Null = nunca editada.';

-- "para mim" não passa por edge function nenhuma: não há nada para pedir ao
-- WhatsApp, é só esconder. Fica como RPC para a tela não precisar de permissão
-- de UPDATE na tabela inteira só por causa disto.
create or replace function public.fn_wa_mensagem_ocultar(p_mensagem uuid)
returns void
language sql
security invoker
set search_path to 'public'
as $$
  update public.wa_mensagens
     set oculta_em = now(), oculta_por = auth.uid()
   where id = p_mensagem and oculta_em is null;
$$;

grant execute on function public.fn_wa_mensagem_ocultar(uuid) to authenticated, service_role;

-- A PRÉVIA DA CAIXA TAMBÉM PRECISA ESQUECER.
--
-- `wa_conversas.ultima_previa` guarda uma CÓPIA do texto da última mensagem,
-- que é o que aparece na lista de conversas. Sem isto, apagar a última
-- mensagem a tirava da conversa e a deixava na lista, à vista de todo mundo,
-- que é exatamente o lugar onde ela é lida de relance.
--
-- Só mexe quando a apagada É a última (`ultima_em = criada_em`): apagar uma
-- mensagem do meio do histórico não muda a prévia de nada.
create or replace function public.fn_wa_previa_apagada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.apagada_em is not null and old.apagada_em is null then
    update public.wa_conversas c
       set ultima_previa = 'Mensagem apagada'
     where c.id = new.conversa_id and c.ultima_em = new.criada_em;
  end if;
  return new;
end $$;

drop trigger if exists trg_wa_previa_apagada on public.wa_mensagens;
create trigger trg_wa_previa_apagada
  after update of apagada_em on public.wa_mensagens
  for each row execute function public.fn_wa_previa_apagada();
