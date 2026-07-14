-- Blindagem do comissionamento: garante que TODO pré-cliente confirmado com
-- descontos ajuizáveis gere um fechamento creditado a quem CRIOU o pré-cliente,
-- direto no banco (via trigger), sem depender do insert client-side — que
-- hoje engole erros silenciosamente e pode "perder" a ação (caso Paulo Ribeiro).
--
-- 1) Índice único por pre_cliente_id: no máximo 1 fechamento por pré-cliente
--    (idempotência — permite ON CONFLICT e evita duplicidade entre o trigger
--    e o insert client-side legado).
create unique index if not exists fechamentos_pre_cliente_uniq
  on public.fechamentos (pre_cliente_id)
  where pre_cliente_id is not null;

-- 2) Função do trigger: ao confirmar um pré-cliente, extrai os descontos NÃO
--    bloqueados do kit, resolve o autor (cadastrado_por -> "primeiro último")
--    e lança o fechamento. SECURITY DEFINER pra ignorar RLS na escrita.
create or replace function public.fn_fechamento_ao_confirmar_pre_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_descontos text[];
  v_autor_nome text;
  v_autor_id uuid;
  v_cliente_nome text;
begin
  -- Dispara só na transição para 'confirmado'.
  if new.status = 'confirmado' and (old.status is distinct from 'confirmado') then

    -- Descontos ajuizáveis = rubricas não bloqueadas da análise comercial do kit.
    select array_agg(r->>'rubrica')
      into v_descontos
      from jsonb_array_elements(
             coalesce(new.dados_completos->'dadosKit'->'_analise_comercial'->'rubricas', '[]'::jsonb)
           ) r
     where coalesce((r->>'bloqueada')::boolean, false) = false
       and coalesce(btrim(r->>'rubrica'), '') <> '';

    -- Sem descontos ajuizáveis, não há o que comissionar.
    if v_descontos is null or array_length(v_descontos, 1) is null then
      return new;
    end if;

    v_autor_nome := new.dados_completos->>'cadastrado_por';

    -- Resolve o user_id do autor pelo "primeiro último" nome (igual nomeSobrenome).
    if v_autor_nome is not null and btrim(v_autor_nome) <> '' then
      select p.id
        into v_autor_id
        from public.profiles p
       where lower(
               split_part(btrim(p.nome), ' ', 1) || ' ' ||
               reverse(split_part(reverse(btrim(p.nome)), ' ', 1))
             ) = lower(btrim(v_autor_nome))
       limit 1;
    end if;

    v_cliente_nome := coalesce((select nome from public.clientes where id = new.cliente_id), new.nome);

    insert into public.fechamentos
      (data, cliente_nome, cliente_id, rubricas, pendencia, pasta_drive, user_id, responsavel, created_by, pre_cliente_id)
    values
      (coalesce(new.confirmed_at::date, current_date),
       v_cliente_nome,
       new.cliente_id,
       v_descontos,
       false, true,
       v_autor_id,
       v_autor_nome,
       coalesce(v_autor_id, new.confirmed_by),
       new.id)
    on conflict (pre_cliente_id) where pre_cliente_id is not null do nothing;
  end if;

  return new;
end;
$$;

-- 3) Trigger AFTER UPDATE em pre_clientes.
drop trigger if exists trg_fechamento_ao_confirmar on public.pre_clientes;
create trigger trg_fechamento_ao_confirmar
  after update on public.pre_clientes
  for each row
  execute function public.fn_fechamento_ao_confirmar_pre_cliente();
