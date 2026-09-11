-- A LEITURA DOS DOCUMENTOS QUE O LEAD MANDOU.
--
-- Tudo que chega do cliente pelo WhatsApp é FOTO: os PDFs são imagem dentro de
-- PDF, feitos por aplicativo de scanner de celular (medido: 9 arquivos, zero
-- operadores de texto). Não existe parser para isso, quem lê é um modelo de
-- visão, e modelo de visão custa e demora.
--
-- Por isso a leitura fica guardada. Abrir a tela duas vezes não pode ler os
-- mesmos nove documentos duas vezes: o documento não muda, a leitura dele
-- também não. A chave é o PATH do arquivo, e não a mensagem: o mesmo arquivo
-- reencaminhado na conversa é o mesmo arquivo.
--
-- O que fica aqui é o CRU, exatamente como o modelo devolveu. Quem julga é a
-- tela (`src/lib/leituraDeDocumentos.ts`), e a regra de julgamento muda com o
-- tempo: guardar o cru permite reavaliar tudo sem pagar a leitura de novo.

create table if not exists public.wa_leitura_documentos (
  id            uuid primary key default gen_random_uuid(),
  conversa_id   uuid not null references public.wa_conversas(id) on delete cascade,
  -- o arquivo no bucket wa-midia; é a identidade da leitura
  midia_path    text not null,
  -- o nome legível, como a conversa mostra
  documento     text,
  -- o que o modelo achou que o documento é ("RG", "comprovante de residência")
  tipo          text,
  -- os campos crus, como vieram: { "nome": "...", "cpf": "...", ... }
  campos        jsonb not null default '{}'::jsonb,
  -- quando a leitura falhou, o motivo, para a tela não mentir que leu
  erro          text,
  modelo        text,
  lida_em       timestamptz not null default now()
);

-- Um arquivo, uma leitura. Reler substitui.
create unique index if not exists wa_leitura_documentos_path_uk
  on public.wa_leitura_documentos (midia_path);

create index if not exists wa_leitura_documentos_conversa_ix
  on public.wa_leitura_documentos (conversa_id);

alter table public.wa_leitura_documentos enable row level security;

drop policy if exists "wa_leitura_documentos_tudo" on public.wa_leitura_documentos;
create policy "wa_leitura_documentos_tudo" on public.wa_leitura_documentos
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));

comment on table public.wa_leitura_documentos is
  'O que o modelo de visão leu em cada documento que o lead mandou. Guarda o cru; quem julga é a tela.';
