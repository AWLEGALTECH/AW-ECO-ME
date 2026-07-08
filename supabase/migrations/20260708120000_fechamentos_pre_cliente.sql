-- Vincula o Fechamento ao pré-cliente que o originou.
-- Ao confirmar um pré-cliente, o app lança automaticamente um fechamento
-- atribuído a quem CRIOU o pré-cliente (voluntário), somando os descontos
-- ajuizáveis (rubricas não bloqueadas) ao placar do quadro de Fechamentos.
--
-- O pre_cliente_id serve pra idempotência: cada pré-cliente gera no máximo
-- um fechamento automático (índice único parcial).

alter table public.fechamentos
  add column if not exists pre_cliente_id uuid references public.pre_clientes(id) on delete set null;

create unique index if not exists fechamentos_pre_cliente_uidx
  on public.fechamentos (pre_cliente_id)
  where pre_cliente_id is not null;
