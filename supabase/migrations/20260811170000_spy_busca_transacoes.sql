-- Banco de transações: busca no SERVIDOR, com índices.
--
-- O front carregava o banco inteiro (páginas de 1000) pra buscar em memória —
-- abria lento e ia piorar com o volume. Agora o front pede lotes pequenos e a
-- busca (descrição, nome do cliente ou valor) roda aqui, sobre tudo.

create extension if not exists pg_trgm;

create index if not exists idx_spy_tx_data on public.spy_transacao (data desc);
create index if not exists idx_spy_tx_desc_trgm on public.spy_transacao using gin (descricao gin_trgm_ops);

create or replace function public.spy_buscar_transacoes(q text default '', lim int default 120, off int default 0)
returns table (id uuid, cliente_id uuid, cliente_nome text, data date, valor numeric, sinal smallint, descricao text)
language sql
stable security definer
set search_path to 'public'
as $$
  select t.id, t.cliente_id, c.nome as cliente_nome, t.data, t.valor, t.sinal, t.descricao
    from public.spy_transacao t
    left join public.clientes c on c.id = t.cliente_id
   where public.fn_tem_modulo('spy')
     and (
       coalesce(q, '') = ''
       or t.descricao ilike '%' || q || '%'
       or c.nome ilike '%' || q || '%'
       -- valor: aceita "1.500,00", "1500,00" e "1500.00" (normaliza pro formato do banco)
       or (q ~ '^[0-9.,]+$' and t.valor::text like '%' || replace(replace(q, '.', ''), ',', '.') || '%')
     )
   order by t.data desc nulls last, t.id
   limit greatest(1, least(lim, 500)) offset greatest(0, off);
$$;
