-- Autoria das rubricas da análise comercial: quem tirou, quem colocou, e a
-- quem a ação foi creditada no fechamento.
--
-- O problema: a análise comercial é um jsonb que se reescreve inteiro a cada
-- edição. Tirar uma rubrica é apagá-la do array — não sobra nenhum rastro de
-- que existiu, nem de quem tirou. E colocar uma rubrica nova reescrevia o
-- fechamento ORIGINAL do cliente, jogando a ação para o mês em que ele fechou
-- e para quem o captou, mesmo que ela tenha sido descoberta meses depois por
-- outra pessoa.
--
-- São dois consertos:
--   1. um registro de eventos, porque estado atual não guarda história;
--   2. a ação nova passa a valer no MÊS em que entrou, para quem for escolhido.

-- ── 1. Histórico ────────────────────────────────────────────────────────────
create table if not exists public.analise_comercial_eventos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id) on delete cascade,
  contrato_id   uuid,
  rubrica       text not null,
  requerido     text,
  acao          text not null check (acao in ('adicionada', 'removida')),
  -- quem operou a edição
  por           uuid references public.profiles(id) on delete set null,
  -- a quem a ação foi creditada no fechamento (só nas adições)
  creditada_a   uuid references public.profiles(id) on delete set null,
  motivo        text,
  fechamento_id uuid,
  created_at    timestamptz not null default now()
);

create index if not exists ace_cliente_idx on public.analise_comercial_eventos (cliente_id, created_at desc);
create index if not exists ace_creditada_idx on public.analise_comercial_eventos (creditada_a, created_at desc);

alter table public.analise_comercial_eventos enable row level security;
drop policy if exists ace_auth_select on public.analise_comercial_eventos;
create policy ace_auth_select on public.analise_comercial_eventos for select to authenticated using (true);
drop policy if exists ace_auth_insert on public.analise_comercial_eventos;
create policy ace_auth_insert on public.analise_comercial_eventos for insert to authenticated with check (true);

comment on table public.analise_comercial_eventos is
  'Histórico de rubricas adicionadas/removidas da análise comercial. O jsonb em clientes.analise_comercial guarda o estado atual; a história mora aqui.';

-- ── 2. Backfill da autoria no que já existe ─────────────────────────────────
-- Sem isto, a primeira edição depois desta migração leria TODA rubrica antiga
-- como recém-adicionada e as lançaria de novo no mês corrente. A data de
-- referência é a do fechamento em que a rubrica foi contabilizada, e o crédito
-- é de quem já estava recebendo por ela.
with base as (
  select c.id as cliente_id,
         (select f.data   from public.fechamentos f where f.cliente_id = c.id
           order by (f.pre_cliente_id is not null) desc, f.data asc limit 1) as data_ref,
         (select f.user_id from public.fechamentos f where f.cliente_id = c.id
           order by (f.pre_cliente_id is not null) desc, f.data asc limit 1) as user_ref
  from public.clientes c
  where jsonb_typeof(c.analise_comercial->'rubricas') = 'array'
),
carimbadas as (
  select b.cliente_id,
         jsonb_agg(
           r.valor
             || jsonb_build_object('adicionada_em', coalesce(r.valor->>'adicionada_em', b.data_ref::text))
             || case when r.valor ? 'creditada_a' then '{}'::jsonb
                     else jsonb_build_object('creditada_a', to_jsonb(b.user_ref)) end
           order by r.ord
         ) as rubricas
  from base b
  join public.clientes c on c.id = b.cliente_id
  cross join lateral jsonb_array_elements(c.analise_comercial->'rubricas') with ordinality as r(valor, ord)
  group by b.cliente_id
)
update public.clientes c
set analise_comercial = jsonb_set(c.analise_comercial, '{rubricas}', k.rubricas)
from carimbadas k
where c.id = k.cliente_id;

-- ── 3. A edição, com autoria e mês certo ────────────────────────────────────
-- Remove UMA ocorrência do elemento (array_remove tira todas, e a mesma ação
-- pode aparecer várias vezes no mesmo fechamento, uma por réu).
create or replace function public.array_remove_first(arr text[], alvo text)
returns text[] language sql immutable as $$
  select case
    when arr is null then null
    when array_position(arr, alvo) is null then arr
    else arr[1:array_position(arr, alvo) - 1] || arr[array_position(arr, alvo) + 1:]
  end;
$$;

create or replace function public.fn_editar_analise_comercial(
  p_cliente_id      uuid,
  p_analise         jsonb,
  p_editor          uuid default null,
  p_creditar_a      uuid default null,
  p_motivo_remocao  text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_chave      text;
  v_antes      jsonb := '{}'::jsonb;   -- chave -> quantidade
  v_rub        jsonb;
  v_ord        int;
  v_saida      jsonb := '[]'::jsonb;
  v_novas      jsonb := '[]'::jsonb;
  v_removidas  jsonb := '[]'::jsonb;
  v_n          int;
  v_cli_nome   text;
  v_creditar   uuid;
  v_fech_orig  uuid;
  v_fech_novo  uuid;
  v_resp_nome  text;
  v_hoje       date := current_date;
begin
  select nome into v_cli_nome from public.clientes where id = p_cliente_id;
  if v_cli_nome is null then
    raise exception 'cliente % nao encontrado', p_cliente_id;
  end if;

  -- Multiconjunto do estado ANTERIOR. A mesma ação pode repetir para réus
  -- diferentes, então a chave é ação + requerido, e a contagem importa.
  for v_rub in
    select e.valor from public.clientes c
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(c.analise_comercial->'rubricas') = 'array'
             then c.analise_comercial->'rubricas' else '[]'::jsonb end) as e(valor)
    where c.id = p_cliente_id
      and coalesce((e.valor->>'bloqueada')::boolean, false) = false
  loop
    v_chave := lower(btrim(coalesce(v_rub->>'rubrica',''))) || '||' ||
               lower(btrim(coalesce(v_rub->>'requerido','')));
    v_antes := jsonb_set(v_antes, array[v_chave],
                 to_jsonb(coalesce((v_antes->>v_chave)::int, 0) + 1));
  end loop;

  -- Percorre o estado NOVO. O que ainda tem saldo no anterior é continuidade e
  -- mantém os carimbos que já tinha; o que não tem é ação nova.
  v_ord := 0;
  for v_rub in select e.valor from jsonb_array_elements(
      case when jsonb_typeof(p_analise->'rubricas') = 'array'
           then p_analise->'rubricas' else '[]'::jsonb end) as e(valor)
  loop
    v_ord := v_ord + 1;
    if coalesce((v_rub->>'bloqueada')::boolean, false) then
      v_saida := v_saida || jsonb_build_array(v_rub);
      continue;
    end if;

    v_chave := lower(btrim(coalesce(v_rub->>'rubrica',''))) || '||' ||
               lower(btrim(coalesce(v_rub->>'requerido','')));
    v_n := coalesce((v_antes->>v_chave)::int, 0);

    if v_n > 0 then
      v_antes := jsonb_set(v_antes, array[v_chave], to_jsonb(v_n - 1));
      v_saida := v_saida || jsonb_build_array(v_rub);
    else
      v_rub := v_rub
        || jsonb_build_object('adicionada_em', v_hoje::text)
        || jsonb_build_object('adicionada_por', to_jsonb(p_editor))
        || jsonb_build_object('creditada_a', to_jsonb(coalesce(p_creditar_a, p_editor)));
      v_saida := v_saida || jsonb_build_array(v_rub);
      v_novas := v_novas || jsonb_build_array(v_rub);
    end if;
  end loop;

  -- O que sobrou de saldo no anterior foi removido nesta edição.
  for v_chave, v_n in select key, value::text::int from jsonb_each(v_antes) where value::text::int > 0
  loop
    for v_ord in 1..v_n loop
      v_removidas := v_removidas || jsonb_build_array(jsonb_build_object(
        'rubrica', split_part(v_chave, '||', 1),
        'requerido', split_part(v_chave, '||', 2)));
    end loop;
  end loop;

  update public.clientes
     set analise_comercial = jsonb_set(coalesce(p_analise, '{}'::jsonb), '{rubricas}', v_saida)
   where id = p_cliente_id;

  -- ── Fechamento ────────────────────────────────────────────────────────────
  -- O ORIGINAL é o do pré-cliente (ou o mais antigo): é o mês em que o cliente
  -- entrou. Ele NÃO é mais reescrito com a lista inteira — só perde o que foi
  -- removido.
  select id, responsavel into v_fech_orig, v_resp_nome
    from public.fechamentos where cliente_id = p_cliente_id
   order by (pre_cliente_id is not null) desc, data asc limit 1;

  if jsonb_array_length(v_removidas) > 0 then
    for v_rub in select e.valor from jsonb_array_elements(v_removidas) as e(valor) loop
      -- Tira do lançamento MAIS RECENTE que contenha a ação: desfazer algo que
      -- se acabou de adicionar não pode cavar num mês antigo.
      update public.fechamentos f
         set rubricas = array_remove_first(f.rubricas, v_rub->>'rubrica')
       where f.id = (
         select f2.id from public.fechamentos f2
          where f2.cliente_id = p_cliente_id
            and (v_rub->>'rubrica') = any(f2.rubricas)
          order by f2.data desc, f2.created_at desc limit 1);

      insert into public.analise_comercial_eventos
        (cliente_id, rubrica, requerido, acao, por, motivo)
      values (p_cliente_id, v_rub->>'rubrica', nullif(v_rub->>'requerido',''),
              'removida', p_editor, p_motivo_remocao);
    end loop;
  end if;

  if jsonb_array_length(v_novas) > 0 then
    -- Sem escolha explícita, o crédito segue de quem já respondia pelo cliente:
    -- é o comportamento antigo, e é o que a tela do Finder (refazer a análise
    -- inteira) continua usando.
    v_creditar := coalesce(p_creditar_a, (select user_id from public.fechamentos where id = v_fech_orig), p_editor);

    -- Lançamento do MÊS CORRENTE para quem recebe o crédito. Sem pre_cliente_id
    -- (o índice único é por pré-cliente, e o original já o ocupa).
    select id into v_fech_novo
      from public.fechamentos
     where cliente_id = p_cliente_id
       and pre_cliente_id is null
       and user_id is not distinct from v_creditar
       and date_trunc('month', data) = date_trunc('month', v_hoje)
     limit 1;

    if v_fech_novo is null then
      insert into public.fechamentos
        (data, cliente_nome, cliente_id, rubricas, pendencia, pasta_drive, user_id, responsavel, created_by)
      values (v_hoje, v_cli_nome, p_cliente_id, array[]::text[], false, true, v_creditar,
              (select nome from public.profiles where id = v_creditar), coalesce(p_editor, v_creditar))
      returning id into v_fech_novo;
    end if;

    for v_rub in select e.valor from jsonb_array_elements(v_novas) as e(valor) loop
      update public.fechamentos
         set rubricas = coalesce(rubricas, '{}') || array[v_rub->>'rubrica']
       where id = v_fech_novo;

      insert into public.analise_comercial_eventos
        (cliente_id, contrato_id, rubrica, requerido, acao, por, creditada_a, fechamento_id)
      values (p_cliente_id, nullif(v_rub->>'contrato_id','')::uuid, v_rub->>'rubrica',
              nullif(v_rub->>'requerido',''), 'adicionada', p_editor, v_creditar, v_fech_novo);
    end loop;
  end if;

  return jsonb_build_object(
    'novas', jsonb_array_length(v_novas),
    'removidas', jsonb_array_length(v_removidas),
    'creditadas_a', (select nome from public.profiles where id = v_creditar),
    'fechamento_novo', v_fech_novo,
    'fechamento_original', v_fech_orig,
    'responsavel_original', v_resp_nome
  );
end;
$function$;

grant execute on function public.fn_editar_analise_comercial(uuid, jsonb, uuid, uuid, text) to authenticated;
grant execute on function public.array_remove_first(text[], text) to authenticated;
