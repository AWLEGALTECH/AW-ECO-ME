-- O CHAMADO VIRA CONVERSA: print, áudio e recado, na mesma linha do tempo.
--
-- Pedido do chefe (18/09): "os colaboradores precisam colocar prints e áudios
-- do que eles precisam exatamente, quase um mini chat de WhatsApp".
--
-- O motivo é o que chega hoje nos chamados. "EXCLUIR AÇÃO / CLIENTE RICARDO
-- BISPO DE MAGALHÃES, cobranças indevidas" foi um chamado bom, e mesmo assim
-- deu uma ida e volta para entender qual rubrica era. A maioria chega pior:
-- "não tá salvando", "deu erro na tela". Um print resolve em dois segundos o
-- que três mensagens de texto não resolvem, e um áudio de quinze segundos
-- descreve um caminho de cliques que ninguém escreve.
--
-- ── ARMAZENAMENTO, que é a parte que decide o desenho ──────────────────────
--
-- Hoje o projeto tem 273 MB, dos quais 264 MB são fotos e áudios do WhatsApp.
-- Os chamados são ~25 por mês. Sem compressão, um print de Mac em PNG tem de
-- 2 a 4 MB: dois por chamado dariam 150 MB por MÊS, e o teto chegaria antes do
-- fim do ano. Comprimido para WebP no próprio navegador, o mesmo print fica em
-- 200 a 300 KB, e o áudio em opus a 16 kbps fica em ~120 KB por minuto. Dá
-- ~600 KB por chamado, 15 MB por mês.
--
-- A compressão mora no navegador de propósito: é o único lugar onde ela evita
-- o tráfego, e não só o disco. Comprimir depois do upload já pagou a subida do
-- arquivo grande.
--
-- Bucket PRÓPRIO, e não o `wa-midia`: são coisas de vidas diferentes. A mídia
-- do WhatsApp é registro de conversa com cliente e fica para sempre; o print
-- de um chamado resolvido em março não serve para nada em dezembro. Separados,
-- dá para fazer faxina num sem tocar no outro.

create table if not exists public.chamado_mensagens (
  id           uuid primary key default gen_random_uuid(),
  chamado_id   uuid not null references public.chamados(id) on delete cascade,
  autor_id     uuid references auth.users(id) on delete set null,
  autor_nome   text,
  texto        text,
  -- texto | imagem | audio | documento. Mesmo vocabulário de wa_mensagens, e
  -- isso é de propósito: quem já leu um, lê o outro.
  tipo         text not null default 'texto',
  midia_path   text,
  midia_mime   text,
  midia_nome   text,
  midia_bytes  bigint,
  -- segundos. O webm gravado pelo navegador não traz a duração no cabeçalho, e
  -- sem este número o player mostra "Infinity" (mesma história da wa_mensagens).
  duracao      int,
  criada_em    timestamptz not null default now(),

  -- Mensagem sem texto e sem anexo é linha vazia na conversa: ninguém quis
  -- mandar isso, e ela só atrapalha quem lê.
  constraint chamado_mensagem_tem_conteudo
    check (coalesce(btrim(texto), '') <> '' or coalesce(btrim(midia_path), '') <> ''),
  constraint chamado_mensagem_tipo
    check (tipo in ('texto', 'imagem', 'audio', 'documento'))
);

create index if not exists idx_chamado_mensagens_chamado
  on public.chamado_mensagens (chamado_id, criada_em);

comment on table public.chamado_mensagens is
  'A conversa dentro de um chamado: recado, print e audio. O anexo vive no bucket "chamados".';

alter table public.chamado_mensagens enable row level security;

-- Mesma regra do chamado: todo mundo da casa lê, porque chamado é assunto do
-- escritório e não do autor.
create policy chamado_mensagens_select on public.chamado_mensagens
  for select to authenticated using (true);

-- Só em nome próprio. Sem isto, dava para escrever assinando outra pessoa.
create policy chamado_mensagens_insert on public.chamado_mensagens
  for insert to authenticated with check (autor_id = auth.uid());

-- Apagar o próprio recado (ou o admin apagar qualquer um). Editar não existe:
-- a conversa do chamado é o registro do que foi pedido, e um pedido que muda
-- de texto depois de respondido confunde quem respondeu.
create policy chamado_mensagens_delete on public.chamado_mensagens
  for delete to authenticated using (public.fn_is_admin() or autor_id = auth.uid());

-- ── o bucket ───────────────────────────────────────────────────────────────
-- PRIVADO. Print de chamado mostra tela de sistema com nome e CPF de cliente
-- dentro; um bucket público seria uma URL adivinhável com dado de cliente.
insert into storage.buckets (id, name, public)
values ('chamados', 'chamados', false)
on conflict (id) do nothing;

-- O caminho é `<chamado_id>/<arquivo>`. A pasta não é conferida contra a
-- tabela de propósito: o chamado é criado e o anexo sobe em seguida, às vezes
-- antes do commit da linha, e uma checagem aqui transformaria uma corrida
-- normal em erro de RLS na cara de quem só queria mandar um print.
create policy "chamados anexo sobe" on storage.objects
  for insert to authenticated with check (bucket_id = 'chamados');

create policy "chamados anexo le" on storage.objects
  for select to authenticated using (bucket_id = 'chamados');

create policy "chamados anexo apaga" on storage.objects
  for delete to authenticated using (bucket_id = 'chamados' and (public.fn_is_admin() or owner = auth.uid()));
