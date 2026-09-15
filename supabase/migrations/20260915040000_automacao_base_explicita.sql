-- A BASE DO GATILHO PASSA A SER UMA RESPOSTA, E NÃO UM PADRÃO.
--
-- O gatilho lia "lista de bases vazia" como "qualquer base deste número". É
-- prático e é uma armadilha: quem escolhia o gatilho e não mexia na lista
-- ligava um fluxo escutando TODAS as planilhas do número sem nunca ter dito
-- isso — e no número que tem a base do Bradesco com 688 linhas isso não é um
-- detalhe.
--
-- Agora são dois estados diferentes: `bases_todas: true` é a escolha explícita
-- de "todas", e lista vazia sem essa marca é "ninguém respondeu ainda". A tela
-- já não deixa LIGAR nesse estado (src/lib/automacoes.ts, `impedimentos`); aqui
-- o gatilho também não DISPARA. São as duas pontas da mesma regra, e a do banco
-- é a que vale.

create or replace function public.fn_wa_automacao_lead_novo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inst text;
  a      record;
  v_ids  jsonb;
begin
  select f.instancia into v_inst from public.leads_fontes f where f.id = new.fonte_id;
  if v_inst is null then return new; end if;

  for a in select * from public.fn_wa_automacoes_de(v_inst, 'lead_novo_na_base') loop
    v_ids := coalesce(a.gatilho_config->'fonte_ids', '[]'::jsonb);

    if (jsonb_array_length(v_ids) = 0 and coalesce((a.gatilho_config->>'bases_todas')::boolean, false))
       or v_ids ? new.fonte_id::text then
      perform public.fn_wa_automacao_enfileirar(
        a.id, 'lead:' || new.id::text, null, new.id, new.telefone, now());
    end if;
  end loop;

  return new;
end $$;
