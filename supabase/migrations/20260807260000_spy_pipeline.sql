-- AW SPY: pipeline real com progresso e transações extraídas.
alter table public.spy_analise add column if not exists progresso    jsonb not null default '{}'::jsonb;
alter table public.spy_analise add column if not exists n_transacoes int;

-- Transações extraídas dos extratos (camada de fato; base da interpretação).
create table if not exists public.spy_transacao (
  id          uuid primary key default gen_random_uuid(),
  analise_id  uuid references public.spy_analise(id) on delete cascade,
  cliente_id  uuid references public.clientes(id) on delete cascade,
  data        date,
  valor       numeric,           -- sempre positivo
  sinal       smallint,          -- +1 crédito, -1 débito
  saldo       numeric,
  descricao   text,
  metodo      text,              -- pix|ted|boleto|cartao|debito|saque|tarifa|...
  banco       text,
  created_at  timestamptz not null default now()
);
create index if not exists spy_transacao_analise_idx on public.spy_transacao (analise_id);
create index if not exists spy_transacao_cliente_idx on public.spy_transacao (cliente_id);
create index if not exists spy_transacao_data_idx    on public.spy_transacao (cliente_id, data);

alter table public.spy_transacao enable row level security;
drop policy if exists spy_transacao_admin on public.spy_transacao;
create policy spy_transacao_admin on public.spy_transacao for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());
