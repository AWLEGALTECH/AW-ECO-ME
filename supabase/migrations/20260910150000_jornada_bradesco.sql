-- A JORNADA DO LEAD PASSA A DEPENDER DO DOSSIÊ.
--
-- O dossiê ganha a BASE de onde a pessoa veio (hoje só existe uma: Leads
-- Bradesco). A base define a JORNADA: lead da base Bradesco anda por oito
-- etapas próprias, detectadas pelo próprio sistema; quem não está em nenhuma
-- base fica na jornada padrão até alguém dizer de onde veio.
--
-- ETAPAS DA JORNADA BRADESCO, e o fato que move cada uma:
--   na_base               está na planilha; a primeira mensagem DELE não tira daqui
--   triagem               a primeira mensagem NOSSA (resposta ou abordagem)
--   aguardando_extrato    mensagem nossa de texto pedindo o extrato
--   aguardando_analise    um PDF recebido dele
--   proposta              análise comercial do Finder ligada a esta conversa
--   aguardando_assinatura pré-cliente criado pelo Writer com este telefone
--   assinado              ZapSign avisou, ou o pré-cliente foi confirmado
--   perdido               manual, com motivo
--
-- O automático só anda PARA A FRENTE e nunca tira ninguém de "perdido". Voltar
-- é decisão de gente, pela tela. Cada mudança continua caindo no wa_etapa_log
-- pelo gatilho que já existe (sem auth.uid(), a passagem fica como automática).

-- ── 1. a base ────────────────────────────────────────────────────────────────
alter table public.leads_fontes add column if not exists base text;
comment on column public.leads_fontes.base is
  'Chave da base para o dossie da conversa (bradesco). Define a jornada do lead.';
update public.leads_fontes set base = 'bradesco' where base is null and nome ilike '%bradesco%';

alter table public.wa_conversas
  add column if not exists base           text check (base in ('bradesco', 'indicacao', 'outra')),
  add column if not exists base_origem    text check (base_origem in ('detectada', 'informada')),
  add column if not exists jornada        text not null default 'padrao' check (jornada in ('padrao', 'bradesco')),
  add column if not exists perdido_motivo text,
  add column if not exists pre_cliente_id uuid references public.pre_clientes(id) on delete set null;

comment on column public.wa_conversas.base is
  'De qual base o lead veio. Detectada pelo telefone na planilha, ou informada pelo atendente quando nao bate com nenhuma.';
comment on column public.wa_conversas.jornada is
  'Conjunto de etapas em uso: padrao, ou bradesco quando a base e bradesco. Derivada da base por gatilho.';

-- A etapa tinha uma lista fechada com as cinco chaves da jornada padrão. A
-- lista passa a ter as duas jornadas; a chave continua fechada, porque uma
-- etapa digitada errado não pode virar uma sétima régua.
alter table public.wa_conversas drop constraint if exists wa_conversas_etapa_check;
alter table public.wa_conversas add constraint wa_conversas_etapa_check
  check (etapa is null or etapa in (
    'chegou', 'triagem', 'extrato', 'proposta', 'fechado',
    'na_base', 'aguardando_extrato', 'aguardando_analise', 'aguardando_assinatura', 'assinado', 'perdido'));

alter table public.analises_comerciais
  add column if not exists conversa_id uuid references public.wa_conversas(id) on delete set null;
comment on column public.analises_comerciais.conversa_id is
  'Conversa do Atendimento de onde saiu esta analise (Finder aberto pela jornada). Move o lead para proposta.';

-- ── 2. utilidades ────────────────────────────────────────────────────────────
-- Últimos oito dígitos: casa o telefone entre planilha, WhatsApp, pré-cliente e
-- cliente sem tropeçar no nono dígito, que cada fonte escreve de um jeito.
create or replace function public.fn_wa_tel8(t text)
returns text language sql immutable as $$
  select right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 8)
$$;

create or replace function public.fn_wa_ordem_etapa_bradesco(e text)
returns int language sql immutable as $$
  select case e
    when 'na_base'               then 1
    when 'triagem'               then 2
    when 'aguardando_extrato'    then 3
    when 'aguardando_analise'    then 4
    when 'proposta'              then 5
    when 'aguardando_assinatura' then 6
    when 'assinado'              then 7
    when 'perdido'               then 99
    else 0 end
$$;

create or replace function public.fn_wa_jornada_da_base(b text)
returns text language sql immutable as $$
  select case when b = 'bradesco' then 'bradesco' else 'padrao' end
$$;

-- Voltando para a jornada padrão (base trocada), a etapa cai no equivalente.
create or replace function public.fn_wa_etapa_para_padrao(e text)
returns text language sql immutable as $$
  select case e
    when 'na_base'               then 'chegou'
    when 'aguardando_extrato'    then 'extrato'
    when 'aguardando_analise'    then 'extrato'
    when 'aguardando_assinatura' then 'fechado'
    when 'assinado'              then 'fechado'
    when 'perdido'               then 'chegou'
    else coalesce(e, 'chegou') end
$$;

-- Em qual base este telefone está. A fonte mais recente vence.
create or replace function public.fn_wa_detectar_base(p_telefone text)
returns table (base text, fonte_id uuid, lead_id uuid)
language sql stable set search_path to 'public' as $$
  select f.base, f.id, b.id
    from public.leads_brutos b
    join public.leads_fontes f on f.id = b.fonte_id
   where f.base is not null
     and public.fn_wa_tel8(b.telefone) = public.fn_wa_tel8(p_telefone)
     and length(public.fn_wa_tel8(p_telefone)) = 8
   order by b.chegou_em desc nulls last
   limit 1
$$;

-- ── 3. a etapa que os fatos dizem ───────────────────────────────────────────
-- Lida do que já aconteceu: mensagens, análise, pré-cliente, cliente. Serve
-- para a carga inicial e para quando uma conversa entra na jornada Bradesco
-- depois de já ter história.
create or replace function public.fn_wa_etapa_bradesco_derivada(p_conversa uuid)
returns text
language plpgsql stable set search_path to 'public' as $$
declare
  v_tel8 text;
begin
  select public.fn_wa_tel8(telefone) into v_tel8 from public.wa_conversas where id = p_conversa;

  if exists (select 1 from public.clientes cl where public.fn_wa_tel8(cl.telefone) = v_tel8 and length(v_tel8) = 8)
     or exists (select 1 from public.pre_clientes p where p.status = 'confirmado' and public.fn_wa_tel8(p.telefone) = v_tel8 and length(v_tel8) = 8)
  then return 'assinado'; end if;

  if exists (select 1 from public.pre_clientes p where p.status = 'aguardando_assinatura' and public.fn_wa_tel8(p.telefone) = v_tel8 and length(v_tel8) = 8)
  then return 'aguardando_assinatura'; end if;

  if exists (select 1 from public.analises_comerciais a where a.conversa_id = p_conversa)
  then return 'proposta'; end if;

  if exists (select 1 from public.wa_mensagens m where m.conversa_id = p_conversa and m.direcao = 'entrada'
               and m.tipo = 'documento' and coalesce(m.midia_mime, '') ~* 'pdf')
  then return 'aguardando_analise'; end if;

  if exists (select 1 from public.wa_mensagens m where m.conversa_id = p_conversa and m.direcao = 'saida'
               and m.tipo = 'texto' and m.texto ~* 'extrato')
  then return 'aguardando_extrato'; end if;

  if exists (select 1 from public.wa_mensagens m where m.conversa_id = p_conversa and m.direcao = 'saida')
  then return 'triagem'; end if;

  return 'na_base';
end $$;

-- ── 4. avançar, e só avançar ────────────────────────────────────────────────
-- O que fica entre a etapa atual e o alvo vira PULADA, como a tela faz quando
-- alguém salta: um PDF que chega antes de pedirmos o extrato leva o lead direto
-- a "aguardando análise", e "aguardando extrato" fica registrada como pulada,
-- não como concluída.
create or replace function public.fn_wa_avancar_bradesco(p_conversa uuid, p_alvo text)
returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare
  v_atual text;
  v_puladas jsonb;
begin
  select coalesce(etapa, 'na_base') into v_atual
    from public.wa_conversas
   where id = p_conversa and jornada = 'bradesco'
   for update;
  if v_atual is null then return false; end if;
  if v_atual = 'perdido' then return false; end if;
  if public.fn_wa_ordem_etapa_bradesco(v_atual) >= public.fn_wa_ordem_etapa_bradesco(p_alvo) then return false; end if;

  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_puladas
    from unnest(array['na_base','triagem','aguardando_extrato','aguardando_analise','proposta','aguardando_assinatura','assinado']) k
   where public.fn_wa_ordem_etapa_bradesco(k) > public.fn_wa_ordem_etapa_bradesco(v_atual)
     and public.fn_wa_ordem_etapa_bradesco(k) < public.fn_wa_ordem_etapa_bradesco(p_alvo);

  update public.wa_conversas
     set etapa = p_alvo,
         etapas_puladas = (
           select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
             from jsonb_array_elements(coalesce(etapas_puladas, '[]'::jsonb) || v_puladas) x)
   where id = p_conversa;
  return true;
end $$;

-- ── 5. a conversa nasce (ou muda de base) e ganha jornada ───────────────────
create or replace function public.fn_wa_conversa_jornada()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
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

  new.jornada := public.fn_wa_jornada_da_base(new.base);

  if tg_op = 'INSERT' then
    if new.jornada = 'bradesco' then new.etapa := 'na_base'; end if;
  elsif new.jornada is distinct from old.jornada then
    -- Entrou na jornada Bradesco com história: a etapa é a que os fatos dizem.
    -- Saiu dela: cai no equivalente da padrão.
    new.etapa := case when new.jornada = 'bradesco'
                      then public.fn_wa_etapa_bradesco_derivada(new.id)
                      else public.fn_wa_etapa_para_padrao(old.etapa) end;
    new.etapas_puladas := '[]'::jsonb;
  end if;
  return new;
end $$;

drop trigger if exists trg_wa_conversa_jornada on public.wa_conversas;
create trigger trg_wa_conversa_jornada
  before insert or update of base, telefone on public.wa_conversas
  for each row execute function public.fn_wa_conversa_jornada();

-- ── 6. cada mensagem pode mover ─────────────────────────────────────────────
create or replace function public.fn_wa_mensagem_avanca_jornada()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_jornada text;
  v_alvo text;
begin
  select jornada into v_jornada from public.wa_conversas where id = new.conversa_id;
  if v_jornada is distinct from 'bradesco' then return new; end if;

  if new.direcao = 'saida' then
    v_alvo := case when new.tipo = 'texto' and coalesce(new.texto, '') ~* 'extrato'
                   then 'aguardando_extrato' else 'triagem' end;
  elsif new.direcao = 'entrada' and new.tipo = 'documento' and coalesce(new.midia_mime, '') ~* 'pdf' then
    v_alvo := 'aguardando_analise';
  end if;

  if v_alvo is not null then perform public.fn_wa_avancar_bradesco(new.conversa_id, v_alvo); end if;
  return new;
end $$;

drop trigger if exists trg_wa_mensagem_avanca_jornada on public.wa_mensagens;
create trigger trg_wa_mensagem_avanca_jornada
  after insert on public.wa_mensagens
  for each row execute function public.fn_wa_mensagem_avanca_jornada();

-- ── 7. o Writer criou o pré-cliente; a confirmação fez dele cliente ─────────
create or replace function public.fn_wa_pre_cliente_avanca_jornada()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  r record;
  v_alvo text;
begin
  if new.telefone is null or length(public.fn_wa_tel8(new.telefone)) < 8 then return new; end if;
  v_alvo := case new.status when 'confirmado' then 'assinado'
                            when 'aguardando_assinatura' then 'aguardando_assinatura' end;
  if v_alvo is null then return new; end if;

  for r in select id from public.wa_conversas
            where public.fn_wa_tel8(telefone) = public.fn_wa_tel8(new.telefone)
  loop
    update public.wa_conversas
       set pre_cliente_id = coalesce(pre_cliente_id, new.id),
           cliente_id     = coalesce(cliente_id, new.cliente_id)
     where id = r.id;
    perform public.fn_wa_avancar_bradesco(r.id, v_alvo);
  end loop;
  return new;
end $$;

drop trigger if exists trg_wa_pre_cliente_avanca_jornada on public.pre_clientes;
create trigger trg_wa_pre_cliente_avanca_jornada
  after insert or update of status, cliente_id on public.pre_clientes
  for each row execute function public.fn_wa_pre_cliente_avanca_jornada();

-- ── 8. o Finder salvou a análise desta conversa ─────────────────────────────
create or replace function public.fn_wa_analise_avanca_jornada()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.conversa_id is not null then
    perform public.fn_wa_avancar_bradesco(new.conversa_id, 'proposta');
  end if;
  return new;
end $$;

drop trigger if exists trg_wa_analise_avanca_jornada on public.analises_comerciais;
create trigger trg_wa_analise_avanca_jornada
  after insert on public.analises_comerciais
  for each row execute function public.fn_wa_analise_avanca_jornada();

-- ── 9. o ZapSign avisou que assinou ─────────────────────────────────────────
-- Pelo nome do signatário, que é o que o ZapSign manda. Só pré-clientes que
-- estavam aguardando assinatura: homônimo antigo já confirmado não conta.
create or replace function public.fn_wa_assinatura_zapsign(p_nome text)
returns int
language plpgsql security definer set search_path to 'public' as $$
declare
  r record;
  n int := 0;
begin
  if coalesce(btrim(p_nome), '') = '' then return 0; end if;
  for r in
    select c.id
      from public.pre_clientes p
      join public.wa_conversas c
        on c.pre_cliente_id = p.id
        or (c.pre_cliente_id is null and public.fn_wa_tel8(c.telefone) = public.fn_wa_tel8(p.telefone)
            and length(public.fn_wa_tel8(p.telefone)) = 8)
     where p.status = 'aguardando_assinatura'
       and lower(btrim(p.nome)) = lower(btrim(p_nome))
  loop
    if public.fn_wa_avancar_bradesco(r.id, 'assinado') then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ── 10. a carga: o que já existe ganha base, jornada e etapa ────────────────
-- Base detectada pelo telefone em todas as fontes (a vinculação antiga só
-- olhava a mesma instância; o dossiê quer saber de onde a pessoa veio, não por
-- qual número ela falou). A troca de base dispara o gatilho, que deriva a etapa.
update public.wa_conversas c
   set base = d.base,
       base_origem = 'detectada',
       fonte_id = coalesce(c.fonte_id, d.fonte_id),
       lead_bruto_id = coalesce(c.lead_bruto_id, d.lead_id)
  from (select c2.id, x.* from public.wa_conversas c2, lateral public.fn_wa_detectar_base(c2.telefone) x) d
 where d.id = c.id and c.base is null and d.base is not null;

-- Pré-cliente e cliente ligados pelo telefone, para todas as jornadas.
update public.wa_conversas c
   set pre_cliente_id = p.id,
       cliente_id = coalesce(c.cliente_id, p.cliente_id)
  from (select distinct on (public.fn_wa_tel8(telefone)) id, cliente_id, telefone
          from public.pre_clientes where telefone is not null
         order by public.fn_wa_tel8(telefone), created_at desc) p
 where c.pre_cliente_id is null
   and length(public.fn_wa_tel8(p.telefone)) = 8
   and public.fn_wa_tel8(c.telefone) = public.fn_wa_tel8(p.telefone);

update public.wa_conversas c
   set cliente_id = cl.id
  from (select distinct on (public.fn_wa_tel8(telefone)) id, telefone
          from public.clientes where telefone is not null
         order by public.fn_wa_tel8(telefone), created_at desc) cl
 where c.cliente_id is null
   and length(public.fn_wa_tel8(cl.telefone)) = 8
   and public.fn_wa_tel8(c.telefone) = public.fn_wa_tel8(cl.telefone);
