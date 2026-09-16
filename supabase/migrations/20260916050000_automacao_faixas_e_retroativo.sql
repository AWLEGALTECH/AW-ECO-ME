-- ═══════════════════════════════════════════════════════════════════════════
-- AUTOMAÇÕES: em que faixa do dia o fluxo manda, e o que fazer com quem
-- chegou fora dela
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Antes havia um interruptor só: "só no horário de atendimento", sim ou não.
-- Ele resolvia metade do problema e escondia duas decisões.
--
-- 1. AS FAIXAS. O dia do número tem três estados, os mesmos do Primeiro
--    atendimento: atendimento (tem gente), direcionamento (já estamos de pé, o
--    responsável ainda não chegou) e fechado (o resto). O interruptor só sabia
--    dizer "atendimento sim/não", e deixava de fora o caso comum de querer
--    mandar também no direcionamento. Agora é uma lista, e lista vazia quer
--    dizer a qualquer hora.
--
-- 2. O RETROATIVO. Chega lead às 3 da manhã e o fluxo só manda no atendimento.
--    Duas respostas defensáveis e opostas: mandar às 7, quando abrir, ou não
--    mandar nunca, porque uma saudação de primeiro contato oito horas atrasada
--    soa a robô. O sistema antigo escolhia a primeira SEM PERGUNTAR — a
--    mensagem era empurrada para a próxima abertura e ninguém sabia que havia
--    escolha ali. Agora é pergunta.
--
-- "DE MANEIRA ORGANIZADA" JÁ ESTAVA RESOLVIDO, e vale dizer para não se
-- procurar o que não falta: `fn_wa_minuto_livre` espaça uma mensagem por
-- minuto por número. Vinte leads represados da madrugada saem 7:00, 7:01,
-- 7:02, e não vinte de uma vez às 7 em ponto.

-- ── 1. o próximo instante em que alguma das faixas escolhidas vale ──────────
-- Anda pelas BORDAS do dia (cada início e cada fim de faixa, mais a
-- meia-noite) e pergunta a `fn_wa_faixa_em` o que vale ali. É mais lento que
-- uma consulta direta e é o jeito certo: 'fechado' não existe como linha em
-- `wa_horarios` — ele é a ausência das outras — então só quem já sabe ler a
-- grade inteira consegue achar o começo de um período fechado. Reusar a função
-- que a tela e o resto do sistema já usam é o que garante que os três digam a
-- mesma coisa.
create or replace function public.fn_wa_automacao_proximo_instante(
  p_instancia text, p_de timestamptz, p_faixas text[])
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  c     record;
  local timestamp;
  d     int;
  r     record;
  f     text;
begin
  -- sem restrição de faixa: agora mesmo serve
  if p_faixas is null or coalesce(array_length(p_faixas, 1), 0) = 0 then return p_de; end if;

  f := public.fn_wa_faixa_em(p_instancia, p_de);
  /* Nulo é "este número não tem grade". Não é "está fechado": quem nunca
     configurou horário não quer o fluxo preso para sempre. */
  if f is null or f = any(p_faixas) then return p_de; end if;

  select * into c from public.wa_atendimento_config where instancia = p_instancia;
  if c is null or not c.ativo then return p_de; end if;
  local := p_de at time zone c.fuso;

  for d in 0..14 loop
    for r in
      select q from (
        select ((local::date + d) + h.inicio) at time zone c.fuso as q
          from public.wa_horarios h
         where h.instancia = p_instancia and h.dia = extract(dow from local::date + d)::int
        union
        select ((local::date + d) + h.fim) at time zone c.fuso
          from public.wa_horarios h
         where h.instancia = p_instancia and h.dia = extract(dow from local::date + d)::int
        union
        select ((local::date + d)::timestamp) at time zone c.fuso
      ) x
      where x.q > p_de
      order by x.q
    loop
      if public.fn_wa_faixa_em(p_instancia, r.q) = any(p_faixas) then
        return r.q;
      end if;
    end loop;
  end loop;

  -- quinze dias sem nenhuma janela: melhor devolver nada do que uma data solta
  return null;
end $$;

revoke execute on function public.fn_wa_automacao_proximo_instante(text, timestamptz, text[]) from public, anon;
grant  execute on function public.fn_wa_automacao_proximo_instante(text, timestamptz, text[]) to service_role, authenticated;

-- ── 2. quando mandar, agora com faixas e retroativo ─────────────────────────
-- Devolve NULL quando não é para mandar. Nulo aqui é resposta, e não falha: é
-- o caso do lead que chegou fora da faixa num fluxo sem retroativo.
create or replace function public.fn_wa_automacao_quando_mandar(
  p_instancia text,
  p_de timestamptz default now(),
  p_faixas text[] default null,
  p_retroativo boolean default true)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_faixa text;
  v_prox  timestamptz;
begin
  if p_faixas is null or coalesce(array_length(p_faixas, 1), 0) = 0 then
    return public.fn_wa_minuto_livre(p_instancia, p_de);
  end if;

  v_faixa := public.fn_wa_faixa_em(p_instancia, p_de);
  if v_faixa is null or v_faixa = any(p_faixas) then
    return public.fn_wa_minuto_livre(p_instancia, p_de);
  end if;

  -- fora da faixa, e este fluxo não guarda quem chegou fora
  if not coalesce(p_retroativo, true) then return null; end if;

  v_prox := public.fn_wa_automacao_proximo_instante(p_instancia, p_de, p_faixas);
  if v_prox is null then return null; end if;
  return public.fn_wa_minuto_livre(p_instancia, v_prox);
end $$;

revoke execute on function public.fn_wa_automacao_quando_mandar(text, timestamptz, text[], boolean) from public, anon;
grant  execute on function public.fn_wa_automacao_quando_mandar(text, timestamptz, text[], boolean) to service_role, authenticated;

-- ── 3. enviar passa a dizer POR QUE não enviou ──────────────────────────────
-- Antes devolvia só o id, e null servia para tudo: texto vazio, conversa que
-- sumiu, fora do horário. O executor não tinha como distinguir "não havia o
-- que mandar" de "havia, e a regra disse que não", e o histórico ficava mudo
-- justamente no caso em que alguém vai perguntar por que o lead não recebeu.
drop function if exists public.fn_wa_automacao_enviar(uuid, text, jsonb, boolean);
create or replace function public.fn_wa_automacao_enviar(
  p_conversa uuid,
  p_texto text,
  p_midias jsonb default '[]'::jsonb,
  p_faixas text[] default null,
  p_retroativo boolean default true)
returns table (agendada uuid, quando timestamptz, motivo text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inst text; v_quando timestamptz; v_id uuid; v_texto text;
  v_midias jsonb := coalesce(p_midias, '[]'::jsonb); m jsonb;
begin
  select instancia into v_inst from public.wa_conversas where id = p_conversa;
  if v_inst is null then
    return query select null::uuid, null::timestamptz, 'sem_conversa'::text; return;
  end if;

  v_quando := public.fn_wa_automacao_quando_mandar(v_inst, now(), p_faixas, p_retroativo);
  if v_quando is null then
    return query select null::uuid, null::timestamptz, 'fora_da_faixa'::text; return;
  end if;

  v_texto := public.fn_wa_texto_variaveis(p_conversa, p_texto, v_quando);

  if coalesce(btrim(v_texto), '') = '' and jsonb_array_length(v_midias) = 0 then
    return query select null::uuid, null::timestamptz, 'sem_conteudo'::text; return;
  end if;

  m := case when jsonb_array_length(v_midias) > 0 then v_midias->0 else null end;

  insert into public.wa_agendadas
    (conversa_id, quando, tipo, texto, midia_path, midia_mime, midia_nome, duracao, midias, status)
  values (
    p_conversa, v_quando,
    coalesce(m->>'tipo', 'texto'),
    nullif(btrim(coalesce(v_texto, '')), ''),
    m->>'path', m->>'mime', m->>'nome',
    nullif(m->>'duracao', '')::int,
    v_midias, 'pendente')
  returning id into v_id;

  return query select v_id, v_quando, null::text;
end $$;

revoke execute on function public.fn_wa_automacao_enviar(uuid, text, jsonb, text[], boolean) from public, anon, authenticated;
grant  execute on function public.fn_wa_automacao_enviar(uuid, text, jsonb, text[], boolean) to service_role;
