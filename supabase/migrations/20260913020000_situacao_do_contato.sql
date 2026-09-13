-- A SITUAÇÃO DO CONTATO: O QUE ESTA PESSOA É PARA O ESCRITÓRIO.
--
-- A ficha de atendimento foi desenhada para LEAD: origem, base, jornada,
-- follow-up. Funciona enquanto a pessoa está no funil. Mas o número do Dr.
-- Matheus não atende funil: atende cliente com processo em curso, escritório
-- adverso negociando acordo, e a própria equipe. Para essa gente a ficha de
-- lead não responde nada. "No funil há 6 dias" para quem tem cinco processos
-- ativos é ruído, e "Jornada Bradesco" para o advogado do banco é errado.
--
-- Levantado nas 56 conversas do corporativo antes de escrever isto:
--
--   cliente       11   9 já ligadas a ficha de cliente + 2 que batem por
--                      telefone e nunca foram ligadas (Eufrazio, Paulo Edson)
--   contraparte    2   BVAA/Acordos CCI Bradesco e Urbano Vitalino: escritórios
--                      do banco negociando acordo, e não gente nossa
--   interno        2   o próprio número do Portal aparecendo como contato, e o
--                      Luan (equipe) que virou cliente num teste
--   sem nome     ~38   números antigos, quase todos de outros estados, com uma
--                      mensagem e nada mais: ficam como estão até alguém olhar
--
-- Cinco valores, e não dois, porque foi o que a base mostrou. Lead e cliente
-- eram óbvios; contraparte e interno estavam lá, escondidos como "leads".
--
-- ────────────────────────── por que é coluna, e não conta ───────────────────
--
-- "Tem cliente_id" quase sempre significa cliente, mas não sempre, e o inverso
-- também falha: o Luan tem virou_cliente_em e é da equipe. Situação é uma
-- decisão de quem atende, com um chute inicial bom vindo dos dados. Guardada,
-- ela sobrevive a esses casos; derivada, ela erraria exatamente neles.
--
-- ─────────────────────── e o bug que este arquivo também fecha ──────────────
--
-- O gatilho da jornada recalcula `jornada` a partir de `base` toda vez que a
-- base muda. Onze minutos depois de o Luan virar cliente, alguém clicou no chip
-- "Bradesco" da ficha, e o gatilho reescreveu jornada=cliente de volta para
-- bradesco e re-derivou a etapa das mensagens. A virada foi desfeita por um
-- clique que não tinha nada a ver com ela. Quem já virou cliente não volta a
-- ser lead porque a base mudou.

-- ── 1. a coluna ─────────────────────────────────────────────────────────────
alter table public.wa_conversas
  add column if not exists situacao text not null default 'lead';

alter table public.wa_conversas
  drop constraint if exists wa_conversas_situacao_check;
alter table public.wa_conversas
  add constraint wa_conversas_situacao_check
  check (situacao = any (array['lead', 'cliente', 'contraparte', 'interno', 'outro']));

comment on column public.wa_conversas.situacao is
  'O que esta pessoa e para o escritorio: lead (no funil), cliente, contraparte (escritorio adverso), interno (equipe e numeros proprios), outro. Decide que ficha a tela desenha.';

create index if not exists ix_wa_conversas_situacao on public.wa_conversas (instancia, situacao);

-- ── 2. o chute inicial, tirado dos dados ────────────────────────────────────
--
-- Ordem importa: o geral primeiro, os casos conhecidos por cima.

-- quem tem ficha de cliente, ou passou pela virada, é cliente
update public.wa_conversas
   set situacao = 'cliente'
 where cliente_id is not null or virou_cliente_em is not null;

-- os dois que batem por telefone e nunca foram ligados: liga e marca
update public.wa_conversas c
   set cliente_id = cl.id, situacao = 'cliente'
  from public.clientes cl
 where c.cliente_id is null
   and c.instancia = 'Dr. Matheus Enes Corporativo'
   and right(regexp_replace(c.telefone, '\D', '', 'g'), 8)
     = right(regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g'), 8)
   and cl.nome in ('EUFRAZIO ALVES BRANDAO', 'PAULO EDSON DE ALBURQUERQUE PINTO');

-- escritórios do banco, negociando acordo
update public.wa_conversas
   set situacao = 'contraparte'
 where telefone in ('5581996940686', '5581992967382');

-- o número do Portal aparecendo como contato do corporativo, e o Luan (equipe)
update public.wa_conversas
   set situacao = 'interno'
 where telefone in ('5592995076380', '5592993000259');

-- ── 3. quem já virou cliente não volta a ser lead ───────────────────────────
create or replace function public.fn_wa_conversa_jornada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  d record;
begin
  if new.base is null then
    select * into d from public.fn_wa_detectar_base(new.telefone);
    if d.base is not null then
      new.base := d.base;
      new.base_origem := 'detectada';
      new.fonte_id := coalesce(new.fonte_id, d.fonte_id);
      new.lead_bruto_id := coalesce(new.lead_bruto_id, d.lead_id);
    end if;
  elsif new.base_origem is null then
    new.base_origem := 'informada';
  end if;

  /* A BASE PODE MUDAR; A VIRADA NÃO SE DESFAZ. Informar de onde a pessoa veio
     é registro de origem e continua valendo para quem já é cliente. O que não
     pode acontecer é a jornada de cliente virar jornada de lead por causa
     disso. Foi exatamente o que aconteceu com o Luan: onze minutos depois da
     virada, um clique no chip "Bradesco" reescreveu a jornada e re-derivou a
     etapa das mensagens, e a ficha voltou a ser de lead. */
  if new.virou_cliente_em is not null or new.jornada = 'cliente' then
    new.jornada := 'cliente';
    return new;
  end if;

  new.jornada := public.fn_wa_jornada_da_base(new.base);

  if tg_op = 'INSERT' then
    if new.jornada = 'bradesco' then new.etapa := 'na_base'; end if;
  elsif new.jornada is distinct from old.jornada then
    new.etapa := case when new.jornada = 'bradesco'
                      then public.fn_wa_etapa_bradesco_derivada(new.id)
                      else public.fn_wa_etapa_para_padrao(old.etapa) end;
    new.etapas_puladas := '[]'::jsonb;
  end if;
  return new;
end $$;

-- ── 4. ganhar ficha de cliente marca a situação ─────────────────────────────
--
-- Só sobe: lead ou outro passam a cliente. Contraparte e interno ficam, porque
-- um advogado da equipe pode ter ficha de cliente (o Diego tem cinco processos
-- próprios) e continuar sendo, para a caixa, gente da casa.
create or replace function public.fn_wa_situacao_por_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.cliente_id is not null and new.situacao in ('lead', 'outro') then
    new.situacao := 'cliente';
  end if;
  return new;
end $$;

drop trigger if exists trg_wa_situacao_por_cliente on public.wa_conversas;
create trigger trg_wa_situacao_por_cliente
  before insert or update of cliente_id on public.wa_conversas
  for each row execute function public.fn_wa_situacao_por_cliente();

-- ── 5. a virada marca a situação nas duas pontas ────────────────────────────
--
-- A pessoa virou cliente; é a MESMA pessoa nos dois números. A conversa antiga
-- da PDA fica legível e muda, e agora também fica com a ficha certa.
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
    return query select false, 'Conversa nao encontrada'::text, null::uuid, null::text;
    return;
  end if;

  select * into v_mov from public.fn_wa_mover_conversa(p_conversa, p_para);
  if not v_mov.ok then
    return query select false, v_mov.erro, v_mov.conversa_existente, null::text;
    return;
  end if;

  select c.id into v_destino
    from public.wa_conversas c
   where c.instancia ilike p_para and c.telefone = v_origem.telefone
   limit 1;

  update public.wa_conversas
     set virou_cliente_em  = now(),
         virou_cliente_por = auth.uid(),
         jornada_anterior  = coalesce(jornada_anterior, v_origem.jornada),
         jornada           = 'cliente',
         etapa             = 'cliente_novo',
         situacao          = 'cliente',
         cliente_id        = coalesce(cliente_id, v_origem.cliente_id),
         arquivada         = false,
         atendimento_finalizado_em = null
   where id = v_destino;

  update public.wa_conversas
     set atendimento_finalizado_em = coalesce(atendimento_finalizado_em, now()),
         virou_cliente_em = coalesce(virou_cliente_em, now()),
         jornada_anterior = coalesce(jornada_anterior, v_origem.jornada),
         situacao         = 'cliente'
   where id = p_conversa;

  select nullif(btrim(cfg.mensagem_boas_vindas), '') into v_msg
    from public.wa_atendimento_config cfg
   where cfg.instancia ilike p_para;

  return query select true, null::text, v_destino, v_msg;
end;
$$;

-- ── 6. mudar a situação pela tela ───────────────────────────────────────────
create or replace function public.fn_wa_mudar_situacao(
  p_conversa uuid,
  p_situacao text
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
  if p_situacao not in ('lead', 'cliente', 'contraparte', 'interno', 'outro') then
    return query select false, format('Situacao desconhecida: %s', p_situacao);
    return;
  end if;

  /* Vale para o GRUPO inteiro: a pessoa é uma só, em quantos números estiver.
     Marcar cliente num número e deixar lead no outro é o mesmo erro que a
     virada acabou de fechar. */
  update public.wa_conversas
     set situacao = p_situacao
   where id = p_conversa
      or grupo_id = (select grupo_id from public.wa_conversas where id = p_conversa and grupo_id is not null);

  if not found then
    return query select false, 'Conversa nao encontrada'::text;
    return;
  end if;
  return query select true, null::text;
end $$;

revoke all on function public.fn_wa_mudar_situacao(uuid, text) from public;
grant execute on function public.fn_wa_mudar_situacao(uuid, text) to authenticated;

-- ── 7. o Luan volta ao estado que a virada tinha deixado ────────────────────
--
-- A virada dele foi desfeita pelo bug do item 3. Com o gatilho corrigido, a
-- conversa de destino volta para a jornada de cliente. A situação já foi para
-- 'interno' no item 2, que é o que ele é.
update public.wa_conversas
   set jornada = 'cliente', etapa = 'cliente_novo'
 where telefone = '5592993000259'
   and instancia = 'Dr. Matheus Enes Corporativo'
   and virou_cliente_em is not null;
