-- QUEM PREENCHE O FORMULÁRIO DE NOVO É UM ACONTECIMENTO NOVO.
--
-- O gatilho da base escutava só INSERT, e isso deixava passar o caso mais comum
-- de todos os testes e um caso real de produção: a MESMA pessoa preenchendo a
-- landing outra vez.
--
-- A base guarda uma linha por telefone (índice único em `fonte_id, telefone`),
-- e é assim que tem que ser: a pessoa que preenche duas vezes no mesmo dia não
-- pode virar duas pessoas na fila. Então a sincronização faz upsert, e a
-- segunda vinda chega como UPDATE. Nenhum INSERT, nenhum gatilho, nada.
--
-- Foi exatamente isso que aconteceu no teste:
--
--   linha 6, 12:20:58   "LUAN TESTE AUTOMAÇÃO 2"   → INSERT, mas antes de ligar
--   linha 7, 12:42:56   "LUAN TESTE AUTOMAÇÃO 3"   → UPDATE, mesmo telefone
--
-- A segunda não disparou porque não era INSERT, e a tela não tinha como contar
-- isso: para quem olha a planilha, as duas são "um lead novo chegou".
--
-- ──────────────────── o que separa "voltou" de "foi tocado" ─────────────────
--
-- Toda sincronização reescreve a linha inteira, de cinco em cinco minutos. Se o
-- gatilho disparasse em qualquer UPDATE, cada leitura da planilha mandaria
-- mensagem para a base inteira — o desastre exato que as travas existem para
-- impedir.
--
-- O que separa um do outro é `chegou_em`, a data que a PLANILHA carimba. Ela só
-- anda quando existe uma submissão mais nova; a releitura da mesma linha
-- reescreve o mesmo valor. Por isso a condição é `chegou_em > chegou_em
-- anterior`, e não "a linha mudou".
--
-- E a chave de idempotência passa a levar a data: "lead:<id>:<chegou_em>". Sem
-- isso, a volta da mesma pessoa colidiria com a chave da primeira vinda e o
-- índice único a recusaria calado.

create or replace function public.fn_wa_automacao_lead_novo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inst  text;
  a       record;
  v_ids   jsonb;
  v_chave text;
begin
  /* No UPDATE, só interessa a planilha ter carimbado uma data MAIS NOVA. Sem
     data não dá para distinguir "voltou" de "foi relido", e na dúvida não se
     manda mensagem para ninguém. */
  if tg_op = 'UPDATE' then
    if new.chegou_em is null or old.chegou_em is null or new.chegou_em <= old.chegou_em then
      return new;
    end if;
  end if;

  select f.instancia into v_inst from public.leads_fontes f where f.id = new.fonte_id;
  if v_inst is null then return new; end if;

  v_chave := 'lead:' || new.id::text || ':' || coalesce(to_char(new.chegou_em, 'YYYYMMDDHH24MISS'), 'sem-data');

  for a in select * from public.fn_wa_automacoes_de(v_inst, 'lead_novo_na_base') loop
    v_ids := coalesce(a.gatilho_config->'fonte_ids', '[]'::jsonb);

    if (jsonb_array_length(v_ids) = 0 and coalesce((a.gatilho_config->>'bases_todas')::boolean, false))
       or v_ids ? new.fonte_id::text then
      perform public.fn_wa_automacao_enfileirar(
        a.id, v_chave, null, new.id, new.telefone, now());
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_wa_automacao_lead_novo on public.leads_brutos;
create trigger trg_wa_automacao_lead_novo
  after insert on public.leads_brutos
  for each row execute function public.fn_wa_automacao_lead_novo();

/* Gatilho separado para o UPDATE, e restrito à coluna `chegou_em`: assim o
   Postgres nem chama a função quando a sincronização reescreve só o nome ou o
   número da linha. */
drop trigger if exists trg_wa_automacao_lead_voltou on public.leads_brutos;
create trigger trg_wa_automacao_lead_voltou
  after update of chegou_em on public.leads_brutos
  for each row execute function public.fn_wa_automacao_lead_novo();
