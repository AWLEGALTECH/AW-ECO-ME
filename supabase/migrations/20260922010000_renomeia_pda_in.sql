-- A INSTÂNCIA "PORTAL DIREITO ABERTO" VIROU "PDA IN".
--
-- 21/09, noite: depois do conflito de sessão (440) que corrompeu a instância
-- dentro da Evolution, o chefe apagou as duas instâncias do Portal no Manager
-- e criou a do inbound de novo, com o mesmo número (92 93199-8822) e o nome
-- `PDA IN`. O nome da instância é a chave de tudo no Atendimento: caixa,
-- conversas, etapas, follow-ups, horários, custódia, LIDs, marca de cor. Sem
-- renomear, o número novo nasceria com a caixa vazia ao lado de uma caixa
-- cheia que ninguém mais alcança.
--
-- Não há chave estrangeira entre as tabelas e `wa_instancias` (é tudo texto),
-- então o rename é um UPDATE por tabela, na mesma transação. A tabela de
-- backup `wa_conversas_teste_bkp_20260907` fica como está: é foto de um dia.
--
-- A função existe para a OUTBOUND passar pelo mesmo caminho quando o nome
-- dela chegar, sem repetir a lista de tabelas à mão.

create or replace function public.fn_wa_renomear_instancia(p_de text, p_para text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r jsonb := '{}'::jsonb;
  n int;
begin
  if p_de is null or p_para is null or p_de = p_para then
    raise exception 'nomes inválidos: % -> %', p_de, p_para;
  end if;
  if not exists (select 1 from public.wa_instancias where nome = p_de) then
    raise exception 'instância "%" não existe em wa_instancias', p_de;
  end if;
  if exists (select 1 from public.wa_instancias where nome = p_para) then
    raise exception 'já existe uma instância chamada "%"', p_para;
  end if;

  update public.wa_instancias set nome = p_para,
         status = 'desconectado', conflito_desde = null, ultima_queda_440_em = null,
         sincronizado_em = now()
   where nome = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_instancias', n);

  update public.wa_conversas set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_conversas', n);
  update public.wa_conversas set movida_de = p_para where movida_de = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_conversas.movida_de', n);

  update public.wa_eventos set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_eventos', n);
  update public.wa_instancia_marca set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_instancia_marca', n);
  update public.wa_followup_cadencia set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_followup_cadencia', n);
  update public.wa_followup_modelos set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_followup_modelos', n);
  update public.wa_followup_regras set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_followup_regras', n);
  update public.wa_horarios set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_horarios', n);
  update public.wa_automacoes set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_automacoes', n);
  update public.wa_atendimento_config set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_atendimento_config', n);
  update public.wa_atendimento_msgs set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_atendimento_msgs', n);
  update public.wa_custodia set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_custodia', n);
  update public.wa_lids set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('wa_lids', n);
  update public.leads_fontes set instancia = p_para where instancia = p_de;
  get diagnostics n = row_count; r := r || jsonb_build_object('leads_fontes', n);

  return r;
end $$;

select public.fn_wa_renomear_instancia('PORTAL DIREITO ABERTO', 'PDA IN');
