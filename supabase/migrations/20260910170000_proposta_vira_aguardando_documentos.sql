-- "PROPOSTA" VIRA "AGUARDANDO DOCUMENTAÇÃO" NA JORNADA BRADESCO.
--
-- O nome descrevia o nosso lado (mandamos uma proposta) e não o que a etapa
-- está esperando, que é o que faz a etapa servir para alguma coisa: nesse
-- ponto a análise já saiu e o que trava o caso é o documento que o cliente
-- ainda não mandou. As outras etapas da régua já se chamam pelo que esperam
-- ("Aguardando extrato", "Aguardando assinatura"); esta destoava.
--
-- A CHAVE MUDA JUNTO, e não só o rótulo. A jornada padrão tem uma etapa
-- 'proposta' que quer dizer outra coisa (sabe o que pedir, falta fechar), e
-- duas etapas diferentes com a mesma chave conviveriam no mesmo log de
-- passagens, onde não há coluna dizendo de qual régua cada linha veio.

-- ── 1. a lista de chaves aceitas ────────────────────────────────────────────
alter table public.wa_conversas drop constraint if exists wa_conversas_etapa_check;
alter table public.wa_conversas add constraint wa_conversas_etapa_check
  check (etapa is null or etapa in (
    'chegou', 'triagem', 'extrato', 'proposta', 'fechado',
    'na_base', 'aguardando_extrato', 'aguardando_analise', 'aguardando_documentos',
    'aguardando_assinatura', 'assinado', 'perdido'));

-- ── 2. as funções da régua ──────────────────────────────────────────────────
create or replace function public.fn_wa_ordem_etapa_bradesco(e text)
returns int language sql immutable as $$
  select case e
    when 'na_base'                then 1
    when 'triagem'                then 2
    when 'aguardando_extrato'     then 3
    when 'aguardando_analise'     then 4
    when 'aguardando_documentos'  then 5
    when 'aguardando_assinatura'  then 6
    when 'assinado'               then 7
    when 'perdido'                then 99
    else 0 end
$$;

create or replace function public.fn_wa_etapa_para_padrao(e text)
returns text language sql immutable as $$
  select case e
    when 'na_base'                then 'chegou'
    when 'aguardando_extrato'     then 'extrato'
    when 'aguardando_analise'     then 'extrato'
    when 'aguardando_documentos'  then 'proposta'
    when 'aguardando_assinatura'  then 'fechado'
    when 'assinado'               then 'fechado'
    when 'perdido'                then 'chegou'
    else coalesce(e, 'chegou') end
$$;

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
  then return 'aguardando_documentos'; end if;

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
    from unnest(array['na_base','triagem','aguardando_extrato','aguardando_analise','aguardando_documentos','aguardando_assinatura','assinado']) k
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

create or replace function public.fn_wa_analise_avanca_jornada()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.conversa_id is not null then
    perform public.fn_wa_avancar_bradesco(new.conversa_id, 'aguardando_documentos');
  end if;
  return new;
end $$;

-- ── 3. o que já está gravado ────────────────────────────────────────────────
-- Só as conversas da régua Bradesco: 'proposta' na régua padrão continua sendo
-- 'proposta'. O log e as puladas acompanham, senão a ficha mostraria uma etapa
-- que não existe mais na régua.
update public.wa_conversas
   set etapa = 'aguardando_documentos'
 where jornada = 'bradesco' and etapa = 'proposta';

update public.wa_conversas c
   set etapas_puladas = (
     select coalesce(jsonb_agg(case when x = '"proposta"'::jsonb then '"aguardando_documentos"'::jsonb else x end), '[]'::jsonb)
       from jsonb_array_elements(c.etapas_puladas) x)
 where c.jornada = 'bradesco' and c.etapas_puladas @> '["proposta"]'::jsonb;

update public.wa_etapa_log l
   set etapa = case when l.etapa = 'proposta' then 'aguardando_documentos' else l.etapa end,
       de    = case when l.de    = 'proposta' then 'aguardando_documentos' else l.de    end
  from public.wa_conversas c
 where c.id = l.conversa_id
   and c.jornada = 'bradesco'
   and 'proposta' in (l.etapa, coalesce(l.de, ''));
