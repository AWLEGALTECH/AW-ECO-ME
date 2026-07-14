-- Política: TODA confirmação de pré-cliente conta pra quem criou, mesmo quando
-- os descontos vêm vazios. Nesse caso, lança 1 "Desconto ajuizável" genérico
-- (mesmo comportamento que o fluxo antigo tinha e que os confirmados de
-- 06-08/07 receberam). Assim nenhuma ação escapa do placar.
--
-- Redefine a função do trigger criado em 20260714120000: a única diferença é
-- que, quando não há descontos não bloqueados, usa-se o fallback de 1 desconto
-- em vez de não lançar nada.
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
  if new.status = 'confirmado' and (old.status is distinct from 'confirmado') then
    select array_agg(r->>'rubrica')
      into v_descontos
      from jsonb_array_elements(
             coalesce(new.dados_completos->'dadosKit'->'_analise_comercial'->'rubricas', '[]'::jsonb)
           ) r
     where coalesce((r->>'bloqueada')::boolean, false) = false
       and coalesce(btrim(r->>'rubrica'), '') <> '';

    -- Descontos vazios: conta 1 "Desconto ajuizável" pra não perder a ação.
    if v_descontos is null or array_length(v_descontos, 1) is null then
      v_descontos := array['Desconto ajuizável'];
    end if;

    v_autor_nome := new.dados_completos->>'cadastrado_por';

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
