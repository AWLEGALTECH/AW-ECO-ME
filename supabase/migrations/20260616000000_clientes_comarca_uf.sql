-- Campos de localização judicial do cliente: comarca (foro) e UF (estado).
-- Preenchidos no cadastro manual, na ficha do cliente e no instrumento
-- procuratório (Writer/kit). Usados para auto-preencher o foro das peças
-- (pacote 3 do Writer) e exibidos no espelho de pré-protocolo.
alter table public.clientes
  add column if not exists comarca text,
  add column if not exists uf text;

comment on column public.clientes.comarca is
  'Comarca/foro do cliente (cidade do juízo). Auto-preenche o foro nas peças do Writer e aparece no espelho de protocolo.';
comment on column public.clientes.uf is
  'Estado (UF) do cliente, sigla de 2 letras. Usado junto com a comarca no Writer e no espelho de protocolo.';
