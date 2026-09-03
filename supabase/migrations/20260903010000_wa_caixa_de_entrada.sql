-- A CAIXA DE ENTRADA DO WHATSAPP.
--
-- Onde as conversas e as mensagens moram quando a Evolution entrega. É o
-- esqueleto que faltava pro módulo Atendimento parar de ser maquete.
--
-- ══ O QUE VEIO DO AW-ECO ══════════════════════════════════════════════════
-- A forma geral é a que o João montou lá, porque já provou que aguenta volume:
--   · uma tabela de CONVERSA por número+instância (lá é `controle_bot`), com
--     nome, foto, não-lidas e o estado do atendimento;
--   · uma tabela de MENSAGEM append-only (lá é `historico_mensagens`), com
--     direção, tipo de mídia e o id do WhatsApp;
--   · número canônico 55+DDD+9 dígitos, porque o WhatsApp guarda o mesmo
--     contato com e sem o nono dígito.
--
-- ══ O QUE MUDOU DE PROPÓSITO ══════════════════════════════════════════════
-- MÍDIA NÃO ENTRA NO BANCO. No AW-ECO o áudio e a imagem viram data URI em
-- base64 dentro da coluna `conteudo` — de 28KB a 20MB POR LINHA. O preço
-- disso está escrito lá: a lista de conversas passou a puxar dezenas de MB e
-- precisou de uma view (`historico_mensagens_preview`) só pra devolver NULL na
-- mídia; depois o projeto bateu no teto de 500MB do Supabase e em 01/09/2026
-- as mensagens novas tiveram que migrar pra um Postgres numa VPS, com ponte e
-- edge function só pra ler o que antes era um select.
--
-- Aqui a mídia vai pro Storage e a linha guarda só o caminho. O banco fica do
-- tamanho do texto e não há teto pra estourar. Mesma arquitetura, cicatriz
-- já curada.
--
-- IDEMPOTÊNCIA: a Evolution reentrega quando não recebe 200 a tempo. O índice
-- único em `id_whatsapp` faz a reentrega virar no-op em vez de duplicata.

create table if not exists public.wa_conversas (
  id            uuid primary key default gen_random_uuid(),
  instancia     text not null,                 -- qual número NOSSO fala
  telefone      text not null,                 -- do contato, canônico
  jid           text,                          -- como o WhatsApp mandou
  nome_wa       text,
  foto_url      text,
  nao_lidas     integer not null default 0,
  ultima_em     timestamptz,
  ultima_previa text,                          -- pra lista não ler mensagem
  arquivada     boolean not null default false,
  cliente_id    uuid references public.clientes(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (instancia, telefone)
);
create index if not exists wa_conversas_ultima_idx on public.wa_conversas (ultima_em desc nulls last);
create index if not exists wa_conversas_cliente_idx on public.wa_conversas (cliente_id);

create table if not exists public.wa_mensagens (
  id           uuid primary key default gen_random_uuid(),
  conversa_id  uuid not null references public.wa_conversas(id) on delete cascade,
  id_whatsapp  text,                            -- trava contra reentrega
  direcao      text not null check (direcao in ('entrada', 'saida')),
  tipo         text not null default 'texto'
               check (tipo in ('texto','audio','imagem','video','documento','sticker','localizacao','contato','outro')),
  texto        text,
  midia_path   text,                            -- CAMINHO no Storage, não o arquivo
  midia_mime   text,
  midia_nome   text,
  midia_bytes  bigint,
  duracao      integer,                         -- segundos, quando é áudio
  enviado_por  uuid references public.profiles(id) on delete set null,
  criada_em    timestamptz not null default now(),
  bruto        jsonb                            -- payload cru, pra quando não bater
);
create unique index if not exists wa_mensagens_id_whatsapp_uniq
  on public.wa_mensagens (id_whatsapp) where id_whatsapp is not null;
create index if not exists wa_mensagens_conversa_idx on public.wa_mensagens (conversa_id, criada_em desc);

-- A conversa se atualiza sozinha quando chega mensagem. Sem isso a lista
-- precisaria de um select por conversa pra saber a última — que é exatamente
-- a consulta que fica cara quando o volume cresce.
create or replace function public.fn_wa_toca_conversa()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  update public.wa_conversas c
     set ultima_em     = new.criada_em,
         ultima_previa = case new.tipo
                           when 'audio'       then '🎵 Áudio'
                           when 'imagem'      then '📷 Imagem'
                           when 'video'       then '🎬 Vídeo'
                           when 'documento'   then '📄 ' || coalesce(new.midia_nome, 'Documento')
                           when 'sticker'     then '🩶 Figurinha'
                           when 'localizacao' then '📍 Localização'
                           when 'contato'     then '👤 Contato'
                           else left(coalesce(new.texto, ''), 120)
                         end,
         -- não-lida só conta o que ENTRA; o que a gente manda já foi lido
         nao_lidas     = case when new.direcao = 'entrada'
                              then coalesce(c.nao_lidas, 0) + 1 else c.nao_lidas end,
         updated_at    = now()
   where c.id = new.conversa_id;
  return new;
end $$;

drop trigger if exists trg_wa_toca_conversa on public.wa_mensagens;
create trigger trg_wa_toca_conversa after insert on public.wa_mensagens
  for each row execute function public.fn_wa_toca_conversa();

-- 55 + DDD + 9 dígitos. A mesma regra de src/lib/phone.ts e da send-whatsapp;
-- aqui em SQL porque a webhook grava sem passar pelo front.
create or replace function public.fn_wa_canonico(raw text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
begin
  if left(d, 2) = '55' and length(d) in (12, 13) then d := substr(d, 3); end if;
  if length(d) = 10 then d := left(d, 2) || '9' || substr(d, 3); end if;
  if length(d) <> 11 then return regexp_replace(coalesce(raw, ''), '\D', '', 'g'); end if;
  return '55' || d;
end $$;

alter table public.wa_conversas enable row level security;
alter table public.wa_mensagens enable row level security;

drop policy if exists wa_conversas_modulo on public.wa_conversas;
create policy wa_conversas_modulo on public.wa_conversas
  for all to authenticated
  using (public.tem_modulo('atendimento')) with check (public.tem_modulo('atendimento'));

drop policy if exists wa_mensagens_modulo on public.wa_mensagens;
create policy wa_mensagens_modulo on public.wa_mensagens
  for all to authenticated
  using (public.tem_modulo('atendimento')) with check (public.tem_modulo('atendimento'));

drop trigger if exists trg_wa_conversas_updated on public.wa_conversas;
create trigger trg_wa_conversas_updated before update on public.wa_conversas
  for each row execute function public.fn_touch_updated_at();

comment on table public.wa_conversas is
  'Uma conversa por número+instância do WhatsApp. Espelha o controle_bot do AW-ECO.';
comment on table public.wa_mensagens is
  'Mensagens do WhatsApp. Mídia vai pro Storage (bucket wa-midia) e aqui fica só o caminho — no AW-ECO ela ia em base64 na coluna e estourou o teto do projeto.';

-- Bucket PRIVADO: áudio e imagem de cliente não podem ser link público.
insert into storage.buckets (id, name, public, file_size_limit)
values ('wa-midia', 'wa-midia', false, 26214400)
on conflict (id) do nothing;

drop policy if exists wa_midia_le on storage.objects;
create policy wa_midia_le on storage.objects for select to authenticated
  using (bucket_id = 'wa-midia' and public.tem_modulo('atendimento'));
