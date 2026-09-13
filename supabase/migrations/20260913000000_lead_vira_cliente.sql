-- O LEAD VIRA CLIENTE, E A CONVERSA MUDA DE CASA.
--
-- Até aqui a jornada terminava em "Assinado" e parava. O lead assinava, virava
-- cliente na prática, e continuava na caixa do PORTAL DIREITO ABERTO, no meio
-- dos que ainda estão sendo triados: a conversa de quem já é cliente com a cara
-- de quem talvez venha a ser.
--
-- Este é o último degrau. "Finalizar atendimento" deixa de ser um interruptor e
-- passa a ser uma bifurcação, com as duas únicas saídas que um lead tem:
--
--   DESCARTAR   o lead deu pra trás. Pergunta o motivo, marca Perdido e
--               arquiva. O motivo é o que, somado, diz onde o funil vaza.
--   VIRAR       virou cliente. Escolhe-se o número por onde ele passa a ser
--   CLIENTE     atendido, a conversa é repassada e a mensagem de boas-vindas
--               fica ENGATILHADA na barra, esperando um enter.
--
-- ────────────────────── por que a mensagem não se envia ─────────────────────
--
-- Ela chega escrita e não enviada, de propósito. É a primeira palavra do
-- escritório com alguém que acabou de assinar um contrato, e o nome que vai
-- nela saiu de um extrato lido por máquina. Quem aperta o enter lê antes. O
-- sistema prepara; a pessoa manda.
--
-- ──────────────────────── o repasse já existia, e é bom ─────────────────────
--
-- `fn_wa_mover_conversa` (migração wa_custodia_de_conversa) já resolve a parte
-- difícil: cria o grupo, passa a custódia, mantém a conversa antiga legível e
-- muda, e deixa o cliente reabrir o número velho se escrever nele. Nada disso
-- é reescrito aqui. Esta função CHAMA aquela e acrescenta o que é próprio da
-- virada: a marca de quando virou, a jornada nova e a lembrança da antiga.

-- ── 1. a mensagem de boas-vindas, por número ────────────────────────────────
--
-- Por número e não uma só para o sistema inteiro: quem recebe cliente no
-- corporativo fala como o corporativo, e um dia haverá outro. Vazio significa
-- "use o texto padrão", que mora na tela.
alter table public.wa_atendimento_config
  add column if not exists mensagem_boas_vindas text;

comment on column public.wa_atendimento_config.mensagem_boas_vindas is
  'Mensagem engatilhada quando um lead vira cliente neste numero. {nome} vira o primeiro nome. Vazio = texto padrao da tela.';

-- ── 2. a marca da virada ────────────────────────────────────────────────────
alter table public.wa_conversas
  add column if not exists virou_cliente_em  timestamptz,
  add column if not exists virou_cliente_por uuid,
  /* A JORNADA ANTIGA NÃO SE PERDE. O dossiê de cliente é outro, com outras
     perguntas, mas o caminho que o lead fez até aqui continua sendo a melhor
     explicação de quem ele é. Guardar a chave da jornada anterior é o que
     permite a tela oferecer "ver o dossiê de lead" sem adivinhar. */
  add column if not exists jornada_anterior  text;

comment on column public.wa_conversas.virou_cliente_em is
  'Quando este lead foi aprovado como cliente. Null = ainda e lead.';
comment on column public.wa_conversas.jornada_anterior is
  'A jornada que ele percorreu como lead (bradesco/padrao), para o historico do dossie.';

create index if not exists ix_wa_conversas_virou_cliente
  on public.wa_conversas (virou_cliente_em) where virou_cliente_em is not null;

-- ── 3. virar cliente ────────────────────────────────────────────────────────
--
-- Devolve o ID da conversa de DESTINO porque a tela precisa dele para abrir a
-- conversa certa e escrever o rascunho nela. Sem isso a tela teria que adivinhar
-- qual linha nasceu do repasse, e adivinhar aqui é escrever para a pessoa
-- errada.
create or replace function public.fn_wa_lead_vira_cliente(
  p_conversa uuid,
  p_para     text
)
returns table (ok boolean, erro text, destino uuid, mensagem text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_origem  public.wa_conversas%rowtype;
  v_mov     record;
  v_destino uuid;
  v_msg     text;
begin
  if not (public.fn_is_admin() or public.tem_modulo('atendimento')) then
    return query select false, 'Sem acesso ao atendimento'::text, null::uuid, null::text;
    return;
  end if;

  select * into v_origem from public.wa_conversas where id = p_conversa;
  if not found then
    return query select false, 'Conversa não encontrada'::text, null::uuid, null::text;
    return;
  end if;

  /* O REPASSE É O DE SEMPRE. Se ele recusar (número desligado, já está lá),
     a recusa sobe inteira: quem sabe explicar isso é aquela função. */
  select * into v_mov from public.fn_wa_mover_conversa(p_conversa, p_para);
  if not v_mov.ok then
    return query select false, v_mov.erro, v_mov.conversa_existente, null::text;
    return;
  end if;

  select c.id into v_destino
    from public.wa_conversas c
   where c.instancia ilike p_para and c.telefone = v_origem.telefone
   limit 1;

  /* A JORNADA VIRA 'cliente' E A ANTIGA FICA GUARDADA. `base` não se toca: é
     ela que o gatilho da jornada observa, e mexer ali faria a jornada ser
     recalculada por cima desta. */
  update public.wa_conversas
     set virou_cliente_em  = now(),
         virou_cliente_por = auth.uid(),
         jornada_anterior  = coalesce(jornada_anterior, v_origem.jornada),
         jornada           = 'cliente',
         etapa             = 'cliente_novo',
         arquivada         = false,
         atendimento_finalizado_em = null
   where id = v_destino;

  /* A conversa de origem sai da régua: o atendimento dela acabou, e o que
     continua é do outro lado. Ela fica legível e muda, como o repasse deixou. */
  update public.wa_conversas
     set atendimento_finalizado_em = coalesce(atendimento_finalizado_em, now()),
         virou_cliente_em = coalesce(virou_cliente_em, now()),
         jornada_anterior = coalesce(jornada_anterior, v_origem.jornada)
   where id = p_conversa;

  select nullif(btrim(cfg.mensagem_boas_vindas), '') into v_msg
    from public.wa_atendimento_config cfg
   where cfg.instancia ilike p_para;

  return query select true, null::text, v_destino, v_msg;
end;
$$;

comment on function public.fn_wa_lead_vira_cliente is
  'Repassa a conversa para o numero onde a pessoa passa a ser atendida como cliente, marca a virada e devolve o destino e a mensagem de boas-vindas daquele numero.';

revoke all on function public.fn_wa_lead_vira_cliente(uuid, text) from public;
grant execute on function public.fn_wa_lead_vira_cliente(uuid, text) to authenticated;

-- ── 4. descartar o lead ─────────────────────────────────────────────────────
--
-- Marcar perdido e arquivar numa chamada só. Em duas, existiria o estado do
-- meio — perdido mas ainda na caixa — e é justamente nele que alguém volta a
-- cobrar quem já desistiu.
create or replace function public.fn_wa_descartar_lead(
  p_conversa uuid,
  p_motivo   text
)
returns table (ok boolean, erro text)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.fn_is_admin() or public.tem_modulo('atendimento')) then
    return query select false, 'Sem acesso ao atendimento'::text;
    return;
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    return query select false, 'O motivo é obrigatório'::text;
    return;
  end if;

  update public.wa_conversas
     set etapa          = 'perdido',
         perdido_motivo = btrim(p_motivo),
         arquivada      = true,
         followup_ativo = false,
         atendimento_finalizado_em = coalesce(atendimento_finalizado_em, now()),
         atendimento_finalizado_por = auth.uid()
   where id = p_conversa;

  if not found then
    return query select false, 'Conversa não encontrada'::text;
    return;
  end if;
  return query select true, null::text;
end;
$$;

comment on function public.fn_wa_descartar_lead is
  'Marca o lead como perdido com o motivo, desliga o follow-up e arquiva, numa chamada so.';

revoke all on function public.fn_wa_descartar_lead(uuid, text) from public;
grant execute on function public.fn_wa_descartar_lead(uuid, text) to authenticated;
