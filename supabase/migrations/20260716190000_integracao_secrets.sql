-- Segredos de integrações externas (ex.: token do webhook do ZapSign).
-- RLS sem policy = ninguém lê pelo client; só o service role (edge function).
create table if not exists public.integracao_secrets (
  chave      text primary key,
  valor      text not null,
  updated_at timestamptz not null default now()
);
alter table public.integracao_secrets enable row level security;
-- (sem policies de propósito — acesso apenas via service role nas edge functions)
