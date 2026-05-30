-- Adiciona o nome do requerido (reu) no cliente. Usado pra estampar o
-- adversario no card da esteira e em outros pontos da ficha.
alter table public.clientes
  add column if not exists requerido text;
comment on column public.clientes.requerido is
  'Nome do requerido/reu principal associado ao cliente (ex: Banco Bradesco).';
