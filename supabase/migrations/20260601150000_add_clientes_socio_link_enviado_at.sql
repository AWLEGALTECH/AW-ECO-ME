-- Carimba quando o link do formulario socioeconomico foi gerado/copiado/
-- enviado a partir da ficha do cliente. Usado pra mostrar na lista de
-- clientes: aguardando_geracao (sem carimbo + sem dados) ->
-- aguardando_resposta (com carimbo + sem dados) -> preenchido (com dados).
alter table public.clientes
  add column if not exists socio_link_enviado_at timestamptz;
comment on column public.clientes.socio_link_enviado_at is
  'Quando o link do formulario socio foi gerado/copiado/enviado pela ultima vez.';
