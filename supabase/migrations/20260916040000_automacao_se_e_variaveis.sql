-- ═══════════════════════════════════════════════════════════════════════════
-- AUTOMAÇÕES: o passo "Se" e as variáveis da base
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dois pedidos, e um caso concreto por trás dos dois.
--
-- O CASO. O lead responde o formulário. O formulário dá o WhatsApp do
-- escritório. Antes de a automação rodar, o lead já mandou "oi, preenchi o
-- formulário". A fila reta responde a ele com a PRIMEIRA mensagem, como se ele
-- nunca tivesse escrito. O que falta é um "se": se já nos escreveu, é outra
-- mensagem.
--
-- 1. O PASSO "SE" tem dois lados, e o lado que a execução tomou fica GRAVADO
--    nela (`decisoes`). Sem isso, um "esperar 2 dias" dentro de um lado não
--    saberia por onde voltar: o executor guarda a posição como um número na
--    lista achatada, e a lista só é a mesma se as decisões forem as mesmas.
--
-- 2. AS VARIÁVEIS DA BASE. A linha bruta da planilha (`leads_brutos.bruto`)
--    tem o cabeçalho como chave: "Nome", "Funcionários", "Situação". Agora
--    `{Funcionários}` no texto vira o que o lead preencheu. Coluna vazia some da
--    frase junto com a vírgula que a antecede, igual o `{nome}` já fazia.
--
-- Como sempre, a tela desenha e o executor anda; quem RESPONDE a pergunta do
-- "Se" é o banco (`fn_wa_automacao_condicao`), num lugar só, testável em
-- transação. O executor só pergunta e grava.

-- ── 1. a decisão de cada "Se" fica na execução ──────────────────────────────
alter table public.wa_automacao_execucoes
  add column if not exists decisoes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(decisoes) = 'object');

comment on column public.wa_automacao_execucoes.decisoes is
  'Qual lado cada passo "Se" tomou, por id do passo: {"p1abc": "entao"}. É o que deixa retomar a execução na lista certa depois de uma espera.';

create or replace function public.fn_wa_automacao_decidir(p_id uuid, p_passo text, p_ramo text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.wa_automacao_execucoes
     set decisoes = decisoes || jsonb_build_object(p_passo, p_ramo)
   where id = p_id
     and p_ramo in ('entao', 'senao')
     and coalesce(p_passo, '') <> '';
$$;

revoke execute on function public.fn_wa_automacao_decidir(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.fn_wa_automacao_decidir(uuid, text, text) to service_role;

-- A fila passa a devolver as decisões já tomadas.
drop function if exists public.fn_wa_automacoes_tomar(int);
create or replace function public.fn_wa_automacoes_tomar(p_limite int default 25)
returns table (
  id uuid, automacao_id uuid, conversa_id uuid, lead_bruto_id uuid,
  telefone text, passo int, tentativas int, disparada_em timestamptz, teste boolean,
  decisoes jsonb,
  instancia text, nome text, passos jsonb, condicoes jsonb, gatilho text
)
language sql
security definer
set search_path to 'public'
as $$
  with pegas as (
    update public.wa_automacao_execucoes e
       set status = 'rodando', tentativas = e.tentativas + 1
     where e.id in (
       select x.id from public.wa_automacao_execucoes x
        where x.status = 'pendente' and x.rodar_em <= now()
        order by x.rodar_em
        limit greatest(1, least(coalesce(p_limite, 25), 100))
        for update skip locked)
    returning e.*)
  select p.id, p.automacao_id, p.conversa_id, p.lead_bruto_id,
         p.telefone, p.passo, p.tentativas, p.disparada_em, p.teste,
         p.decisoes,
         a.instancia, a.nome, a.passos, a.condicoes, a.gatilho
    from pegas p join public.wa_automacoes a on a.id = p.automacao_id;
$$;

revoke execute on function public.fn_wa_automacoes_tomar(int) from public, anon, authenticated;
grant  execute on function public.fn_wa_automacoes_tomar(int) to service_role;

-- ── 2. qual linha da planilha é deste lead ──────────────────────────────────
-- A conversa aponta para o lead (`lead_bruto_id`) quando foi ela que veio da
-- base. Quando o lead veio primeiro pelo WhatsApp e a linha da planilha chegou
-- depois, a conversa não sabe dele; aí vale o telefone, nas bases deste número,
-- a linha mais recente.
create or replace function public.fn_wa_automacao_lead(p_conversa uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    c.lead_bruto_id,
    (select b.id
       from public.leads_brutos b
       join public.leads_fontes f on f.id = b.fonte_id
      where b.telefone = c.telefone
        and lower(f.instancia) = lower(c.instancia)
      order by b.chegou_em desc nulls last
      limit 1))
    from public.wa_conversas c
   where c.id = p_conversa;
$$;

revoke execute on function public.fn_wa_automacao_lead(uuid) from public, anon;
grant  execute on function public.fn_wa_automacao_lead(uuid) to service_role, authenticated;

-- ── 3. a pergunta do "Se", respondida num lugar só ──────────────────────────
--   {"tipo":"ja_escreveu"}                          já mandou mensagem neste número, alguma vez
--   {"tipo":"respondeu"}                            escreveu depois de p_desde (o disparo)
--   {"tipo":"campo","campo":"Funcionários",
--    "op":"contem|igual|vazio|nao_vazio","valor":"50"}
-- Comparação sem diferenciar maiúscula, e "contém" é o padrão: "50" acha
-- "mais de 50 funcionários", que é como a pessoa pensa a regra.
create or replace function public.fn_wa_automacao_condicao(p_conversa uuid, p_desde timestamptz, p_cond jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tipo  text := coalesce(p_cond->>'tipo', 'ja_escreveu');
  v_lead  uuid;
  v_valor text;
  v_op    text;
  v_alvo  text;
begin
  if v_tipo = 'ja_escreveu' then
    return exists (
      select 1 from public.wa_mensagens m
       where m.conversa_id = p_conversa and m.direcao = 'entrada');
  end if;

  if v_tipo = 'respondeu' then
    return public.fn_wa_automacao_respondeu(p_conversa, coalesce(p_desde, now()));
  end if;

  if v_tipo = 'campo' then
    v_lead := public.fn_wa_automacao_lead(p_conversa);
    v_op   := coalesce(p_cond->>'op', 'contem');
    v_alvo := lower(btrim(coalesce(p_cond->>'valor', '')));

    if v_lead is not null and coalesce(btrim(p_cond->>'campo'), '') <> '' then
      select kv.value into v_valor
        from public.leads_brutos b, jsonb_each_text(coalesce(b.bruto, '{}'::jsonb)) kv
       where b.id = v_lead
         and lower(btrim(kv.key)) = lower(btrim(p_cond->>'campo'))
       limit 1;
    end if;
    v_valor := btrim(coalesce(v_valor, ''));

    if v_op = 'vazio'     then return v_valor = ''; end if;
    if v_op = 'nao_vazio' then return v_valor <> ''; end if;
    if v_op = 'igual'     then return lower(v_valor) = v_alvo; end if;
    -- contem: alvo vazio não casa com nada (a tela nem deixa ligar assim)
    return v_alvo <> '' and position(v_alvo in lower(v_valor)) > 0;
  end if;

  return false;
end $$;

revoke execute on function public.fn_wa_automacao_condicao(uuid, timestamptz, jsonb) from public, anon;
grant  execute on function public.fn_wa_automacao_condicao(uuid, timestamptz, jsonb) to service_role, authenticated;

-- ── 4. as variáveis da base no texto ────────────────────────────────────────
-- `{nome}` e `{horario}` continuam como eram e VÊM PRIMEIRO. As colunas da base
-- casam pelo nome exato do cabeçalho (com maiúscula: `{Nome}` é a coluna, e
-- `{nome}` é o primeiro nome da conversa). É assim de propósito: a bandeja da
-- tela insere o cabeçalho como está, e casar sem diferenciar maiúscula faria a
-- coluna "Nome" da planilha engolir o `{nome}` que sempre existiu.
--
-- Dois cuidados no `regexp_replace`: o cabeçalho pode ter parêntese ou ponto
-- (viram literais), e o valor pode ter barra invertida (que no lugar de
-- substituição seria lido como referência a grupo).
--
-- De quebra, `{nome}` passa a preferir o nome REAL da conversa, quando alguém
-- da equipe já o escreveu, ao nome que o WhatsApp mostra. Com um cuidado que o
-- teste pegou: o nome real costuma vir com título ("Dr. Fulano Real"), e o
-- primeiro pedaço dele é "Dr.". Saudação de robô dizendo "Oi Dr." é pior que
-- não dizer nome nenhum, então o título sai antes.
--
-- E CHAVE QUE SOBRA SOME. Uma coluna nova no formulário não existe nas linhas
-- antigas da planilha: aquele lead não tem a chave, e `{ColunaNova}` iria
-- LITERAL para o WhatsApp dele. Some junto com a vírgula, igual coluna vazia.
-- Quem escreve o fluxo é avisado na tela, na hora de ligar, quando usa uma
-- variável que não existe em base nenhuma.
create or replace function public.fn_wa_texto_variaveis(p_conversa uuid, p_texto text, p_quando timestamptz)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  t        text := coalesce(p_texto, '');
  v_nome   text;
  v_hora   text;
  v_inst   text;
  v_lead   uuid;
  r        record;
  v_chave  text;
begin
  if t = '' then return t; end if;

  select c.instancia,
         split_part(
           btrim(regexp_replace(
             coalesce(nullif(btrim(c.nome_real), ''), c.nome_wa, ''),
             '^(dr|dra|sr|sra|exmo|exma|prof|profa)\.?\s+', '', 'i')),
           ' ', 1)
    into v_inst, v_nome
    from public.wa_conversas c where c.id = p_conversa;

  if position('{horario}' in t) > 0 then
    select to_char(x.quando at time zone cfg.fuso, 'HH24:MI') into v_hora
      from public.fn_wa_proxima_faixa(v_inst, p_quando, 'atendimento') x
      join public.wa_atendimento_config cfg on cfg.instancia = v_inst
     limit 1;
    t := replace(t, '{horario}', coalesce(v_hora, 'em breve'));
  end if;

  if coalesce(v_nome, '') = '' then
    t := regexp_replace(t, '[,\s]*\{nome\}', '', 'g');
  else
    t := replace(t, '{nome}', v_nome);
  end if;

  -- Sobrou chave? Então pode ser coluna da base.
  if position('{' in t) > 0 then
    v_lead := public.fn_wa_automacao_lead(p_conversa);
    if v_lead is not null then
      for r in
        select kv.key, kv.value
          from public.leads_brutos b, jsonb_each_text(coalesce(b.bruto, '{}'::jsonb)) kv
         where b.id = v_lead
      loop
        if position('{' || r.key || '}' in t) = 0 then continue; end if;
        -- o cabeçalho vira padrão literal: escapa o que a regex leria como especial
        v_chave := regexp_replace(r.key, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g');
        if coalesce(btrim(r.value), '') = '' then
          t := regexp_replace(t, '[,\s]*\{' || v_chave || '\}', '', 'g');
        else
          t := regexp_replace(t, '\{' || v_chave || '\}', replace(btrim(r.value), '\', '\\'), 'g');
        end if;
      end loop;
    end if;

    -- O que sobrou entre chaves não tem dono: sai da frase em vez de ir junto.
    t := regexp_replace(t, '[,\s]*\{[^{}' || chr(10) || ']{1,80}\}', '', 'g');
  end if;

  return btrim(regexp_replace(t, '[ \t]{2,}', ' ', 'g'));
end $function$;
