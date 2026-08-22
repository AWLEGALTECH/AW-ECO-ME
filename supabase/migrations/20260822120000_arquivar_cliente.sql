-- Arquivamento de cliente.
--
-- Cliente que nao se consegue mais contato nao pode simplesmente sumir nem
-- continuar poluindo a lista de quem esta ativo. Ele vai para uma area a
-- parte, e leva consigo as duas informacoes que explicam o porque: quando foi
-- a ultima tentativa de contato e o motivo escrito por quem arquivou.
--
-- Sao dados de decisao, nao de cadastro: quem abre a ficha de um arquivado
-- precisa entender em dois segundos o que aconteceu com aquela pessoa.

alter table public.clientes
  add column if not exists arquivado_em timestamptz,
  add column if not exists arquivado_por uuid references public.profiles(id) on delete set null,
  add column if not exists arquivado_motivo text,
  -- Data da ultima tentativa de contato. Fica fora do bloco de arquivamento
  -- de proposito: serve para qualquer cliente, arquivado ou nao.
  add column if not exists ultimo_contato_em date;

comment on column public.clientes.arquivado_em is
  'Quando o cliente foi arquivado. Nulo = ativo. E este campo que separa a lista de ativos da area de arquivados.';
comment on column public.clientes.arquivado_motivo is
  'Por que foi arquivado. Obrigatorio no fluxo de arquivamento.';
comment on column public.clientes.ultimo_contato_em is
  'Data da ultima tentativa de contato com o cliente.';

-- A lista de ativos filtra por arquivado_em is null em toda carga, e os
-- arquivados sao poucos: indice parcial cobre os dois lados sem pesar.
create index if not exists idx_clientes_arquivados
  on public.clientes (arquivado_em desc) where arquivado_em is not null;
