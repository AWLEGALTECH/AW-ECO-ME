-- A JORNADA PADRÃO TAMBÉM ANDA SOZINHA.
--
-- Um lead recebeu seis mensagens da Adria, três delas pedindo o extrato, e
-- continuou em "Chegou". Não era bug de detecção de palavra: o gatilho começa
-- com
--
--     if v_jornada is distinct from 'bradesco' then return new; end if;
--
-- e esse lead está na jornada PADRÃO, porque o telefone dele não está em base
-- nenhuma. Ou seja, a régua automática só existia para a Bradesco, e a padrão
-- nunca moveu ninguém: as 61 conversas dela estavam TODAS em "Chegou", a
-- primeira etapa, incluindo gente que já mandou documento. Um funil de cinco
-- etapas em que ninguém nunca sai da primeira não é um funil, é um enfeite.
--
-- A regra passa a ser a mesma nas duas, traduzida para os nomes de cada uma:
--
--   mensagem nossa (não automática)  → Triagem
--   mensagem nossa dizendo "extrato" → Aguardando extrato / Extrato
--   PDF que o cliente manda          → Aguardando análise / (nada na padrão)
--
-- O PDF NÃO MOVE NADA NA PADRÃO de propósito. Na Bradesco existe "Aguardando
-- análise", que é exatamente "chegou o documento, falta rodar o Finder". Na
-- padrão não existe etapa equivalente: depois de "Extrato" vem "Proposta", que
-- quer dizer "já sei o que dá pra pedir" — e isso não é verdade no segundo em
-- que o PDF chega. Inventar esse pulo aqui seria mentir sobre o funil; criar a
-- etapa que falta é decisão de quem desenhou o funil, não minha.

-- ── 1. ordem das etapas, agora nas duas réguas ──────────────────────────────
create or replace function public.fn_wa_ordem_etapa_padrao(e text)
returns int language sql immutable as $$
  select case e
    when 'chegou'   then 1
    when 'triagem'  then 2
    when 'extrato'  then 3
    when 'proposta' then 4
    when 'fechado'  then 5
    when 'perdido'  then 99
    else 0 end
$$;

create or replace function public.fn_wa_ordem_etapa(p_jornada text, e text)
returns int language sql immutable as $$
  select case when p_jornada = 'bradesco'
              then public.fn_wa_ordem_etapa_bradesco(e)
              else public.fn_wa_ordem_etapa_padrao(e) end
$$;

-- O trilho de cada régua, em ordem. É o que diz quais etapas ficaram no meio
-- quando um pulo acontece.
create or replace function public.fn_wa_etapas_da_jornada(p_jornada text)
returns text[] language sql immutable as $$
  select case when p_jornada = 'bradesco'
    then array['na_base','triagem','aguardando_extrato','aguardando_analise',
               'aguardando_documentos','aguardando_assinatura','assinado']
    else array['chegou','triagem','extrato','proposta','fechado'] end
$$;

-- ── 2. avançar, em qualquer régua ───────────────────────────────────────────
-- Mesmo contrato do `fn_wa_avancar_bradesco`: só para frente, nunca ressuscita
-- lead perdido, e carimba como puladas as etapas que ficaram no meio.
create or replace function public.fn_wa_avancar_etapa(p_conversa uuid, p_alvo text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_jornada text;
  v_atual   text;
  v_puladas jsonb;
begin
  select jornada, etapa into v_jornada, v_atual
    from public.wa_conversas where id = p_conversa for update;
  if v_jornada is null then return false; end if;
  v_atual := coalesce(v_atual, (public.fn_wa_etapas_da_jornada(v_jornada))[1]);
  if v_atual = 'perdido' then return false; end if;
  if public.fn_wa_ordem_etapa(v_jornada, v_atual) >= public.fn_wa_ordem_etapa(v_jornada, p_alvo)
    then return false; end if;

  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_puladas
    from unnest(public.fn_wa_etapas_da_jornada(v_jornada)) k
   where public.fn_wa_ordem_etapa(v_jornada, k) > public.fn_wa_ordem_etapa(v_jornada, v_atual)
     and public.fn_wa_ordem_etapa(v_jornada, k) < public.fn_wa_ordem_etapa(v_jornada, p_alvo);

  update public.wa_conversas
     set etapa = p_alvo,
         etapas_puladas = (
           select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
             from jsonb_array_elements(coalesce(etapas_puladas, '[]'::jsonb) || v_puladas) x)
   where id = p_conversa;
  return true;
end $function$;

-- O nome antigo continua valendo: a RPC do ZapSign e o gatilho de pré-cliente
-- chamam por ele. Passa a ser um apelido, para não existirem duas regras de
-- avanço que um dia divergem.
create or replace function public.fn_wa_avancar_bradesco(p_conversa uuid, p_alvo text)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select public.fn_wa_avancar_etapa(p_conversa, p_alvo);
$function$;

-- ── 3. para onde uma mensagem leva, em cada régua ───────────────────────────
create or replace function public.fn_wa_alvo_da_mensagem(
  p_jornada text, p_direcao text, p_tipo text, p_texto text, p_mime text, p_automatica boolean
) returns text language sql immutable as $$
  select case
    -- Resposta automática não é atendimento: um "estamos fechados" que sai
    -- sozinho não é alguém ter olhado o caso.
    when p_direcao = 'saida' and coalesce(p_automatica, false) then null
    when p_direcao = 'saida' and p_tipo = 'texto' and coalesce(p_texto, '') ~* 'extrato'
      then case when p_jornada = 'bradesco' then 'aguardando_extrato' else 'extrato' end
    when p_direcao = 'saida' then 'triagem'
    when p_direcao = 'entrada' and p_tipo = 'documento' and coalesce(p_mime, '') ~* 'pdf'
      then case when p_jornada = 'bradesco' then 'aguardando_analise' else null end
    else null end
$$;

create or replace function public.fn_wa_mensagem_avanca_jornada()
returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_jornada text;
  v_alvo    text;
begin
  select jornada into v_jornada from public.wa_conversas where id = new.conversa_id;
  if v_jornada is null then return new; end if;

  v_alvo := public.fn_wa_alvo_da_mensagem(
    v_jornada, new.direcao, new.tipo, new.texto, new.midia_mime, new.automatica);

  if v_alvo is not null then perform public.fn_wa_avancar_etapa(new.conversa_id, v_alvo); end if;
  return new;
end $function$;

-- ── 4. a carga: o que já aconteceu na jornada padrão ────────────────────────
-- 61 conversas em "Chegou", várias delas com o pedido de extrato feito dias
-- atrás. Elas ganham a etapa que os fatos dizem, e o histórico ganha a passagem
-- com a DATA DA MENSAGEM que a teria causado, não a de agora: dizer que o lead
-- entrou em Triagem hoje, quando foi triado na terça, é pior que não dizer.
--
-- O gatilho do log fica desligado durante a carga justamente por isso: ele
-- carimbaria `now()`. As linhas entram à mão, marcadas como estimadas, que é o
-- asterisco que a tela já sabe mostrar.
alter table public.wa_conversas disable trigger trg_wa_etapa_log_mudou;

with fatos as (
  select c.id,
         min(m.criada_em) filter (
           where m.direcao = 'saida' and coalesce(m.automatica, false) = false) as t_triagem,
         min(m.criada_em) filter (
           where m.direcao = 'saida' and coalesce(m.automatica, false) = false
             and m.tipo = 'texto' and coalesce(m.texto, '') ~* 'extrato') as t_extrato
    from public.wa_conversas c
    join public.wa_mensagens m on m.conversa_id = c.id
   where c.jornada = 'padrao' and c.etapa = 'chegou'
   group by c.id
),
nova as (
  select id, t_triagem, t_extrato,
         case when t_extrato is not null then 'extrato'
              when t_triagem is not null then 'triagem'
              else null end as etapa
    from fatos
),
mexe as (
  update public.wa_conversas c set etapa = n.etapa
    from nova n where n.id = c.id and n.etapa is not null
  returning c.id
)
insert into public.wa_etapa_log (conversa_id, etapa, de, entrou_em, estimado)
select n.id, p.etapa, p.de, p.quando, true
  from nova n
  join mexe on mexe.id = n.id
  cross join lateral (values
    ('triagem', 'chegou',  n.t_triagem),
    ('extrato', 'triagem', n.t_extrato)
  ) as p(etapa, de, quando)
 where p.quando is not null;

alter table public.wa_conversas enable trigger trg_wa_etapa_log_mudou;
