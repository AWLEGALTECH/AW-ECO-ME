-- Fecha a origem das levas órfãs.
--
-- Até aqui, confirmar um pré-cliente copiava `_analise_comercial` do Writer
-- literalmente para o cliente. As rubricas do Writer não têm `id` nem
-- `grupo_id`, e nenhum `grupos[]` era criado — então a primeira leva de todo
-- cliente vindo do Kit nascia sem dono. O seletor de levas lista `grupos[]`, e
-- o que não está lá não pode ser corrigido: a leva original ficava congelada.
--
-- Agora a leva nasce junto com o fechamento, apontando para ele. Nada de
-- contabilidade nova: é o MESMO fechamento que o trigger já criava, só que
-- agora endereçável. O crédito é o mesmo v_autor_id que já ia para o
-- fechamento, então ninguém ganha nem perde ação por causa desta mudança.
--
-- O corpo anterior é preservado integralmente; o que muda é (a) guardar o id do
-- fechamento e (b) embrulhar as rubricas num grupo na hora de copiar.

create or replace function public.fn_fechamento_ao_confirmar_pre_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_descontos    text[];
  v_autor_nome   text;
  v_autor_id     uuid;
  v_cliente_nome text;
  v_fech         uuid;
  v_ac           jsonb;
  v_grupo        uuid;
  v_rubricas     jsonb := '[]'::jsonb;
  v_rub          jsonb;
begin
  if new.status = 'confirmado' and (old.status is distinct from 'confirmado') then
    select array_agg(r->>'rubrica')
      into v_descontos
      from jsonb_array_elements(
             coalesce(new.dados_completos->'dadosKit'->'_analise_comercial'->'rubricas', '[]'::jsonb)
           ) r
     where coalesce((r->>'bloqueada')::boolean, false) = false
       and coalesce(btrim(r->>'rubrica'), '') <> '';

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
    on conflict (pre_cliente_id) where pre_cliente_id is not null do nothing
    returning id into v_fech;

    -- confirmação repetida não insere de novo; o fechamento que já existe é o
    -- mesmo ao qual a leva tem que se prender
    if v_fech is null then
      select id into v_fech from public.fechamentos where pre_cliente_id = new.id limit 1;
    end if;

    -- Copia a análise comercial completa para o cliente (perfil lê daqui).
    -- Não sobrescreve se já houver uma análise (ex.: ajuste manual anterior).
    if new.cliente_id is not null
       and new.dados_completos->'dadosKit'->'_analise_comercial' is not null then

      v_ac := new.dados_completos->'dadosKit'->'_analise_comercial';
      v_grupo := gen_random_uuid();

      -- cada rubrica ganha identidade e entra na leva inicial; sem isso ela
      -- nasce órfã e nunca mais pode ser corrigida pela tela
      for v_rub in
        select e.valor from jsonb_array_elements(
          case when jsonb_typeof(v_ac->'rubricas') = 'array' then v_ac->'rubricas' else '[]'::jsonb end
        ) as e(valor)
      loop
        v_rubricas := v_rubricas || jsonb_build_array(
          v_rub
          || jsonb_build_object('grupo_id', to_jsonb(v_grupo::text))
          || case when v_rub ? 'id' then '{}'::jsonb
                  else jsonb_build_object('id', to_jsonb(gen_random_uuid()::text)) end
        );
      end loop;

      if jsonb_array_length(v_rubricas) > 0 then
        v_ac := v_ac || jsonb_build_object(
          'rubricas', v_rubricas,
          'grupos', jsonb_build_array(jsonb_build_object(
            'id',            v_grupo::text,
            'criado_em',     coalesce(new.confirmed_at::date, current_date)::text,
            'criado_por',    to_jsonb(coalesce(v_autor_id, new.confirmed_by)),
            'creditada_a',   to_jsonb(v_autor_id),
            'contrato_id',   to_jsonb(nullif(v_rubricas->0->>'contrato_id','')),
            'fechamento_id', to_jsonb(v_fech)
          ))
        );
      end if;

      update public.clientes
         set analise_comercial = v_ac
       where id = new.cliente_id
         and analise_comercial is null;
    end if;
  end if;

  return new;
end;
$function$;
