-- Nomes dos advogados destinatarios retornados pela API DJEN. Util pra
-- confirmar visualmente que a publicacao endereca quem deveria.
alter table public.publicacoes
  add column if not exists advogados_destinatarios text[];
comment on column public.publicacoes.advogados_destinatarios is
  'Nomes dos advogados destinatarios conforme retornado pela API DJEN.';
