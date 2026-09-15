-- AS AÇÕES DA AUTOMAÇÃO QUE PRECISAM SER DO BANCO.
--
-- O executor (edge function `wa-automacoes`) roda a fila de passos, mas as duas
-- decisões abaixo ficam aqui, e não lá, porque elas já existem em SQL para o
-- primeiro atendimento e duas cópias da mesma regra é o jeito conhecido de elas
-- discordarem seis meses depois, uma corrigida e a outra não.

-- ── 1. quando essa mensagem pode sair ───────────────────────────────────────
--
-- Três respostas possíveis, e a terceira é a que importa:
--
--   sem grade de horário configurada  → agora. Uma grade que não existe não
--                                       pode travar o envio: seria trocar um
--                                       problema raro por um garantido.
--   dentro do atendimento             → agora.
--   fora                              → na próxima janela de atendimento.
--
-- E, em qualquer caso, no próximo MINUTO LIVRE daquele número: é a trava que
-- impede vinte leads novos da planilha de virarem vinte mensagens no mesmo
-- segundo, que é o padrão que derruba número.
create or replace function public.fn_wa_automacao_quando_mandar(
  p_instancia    text,
  p_de           timestamptz default now(),
  p_so_comercial boolean default true
) returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_faixa text;
  v_prox  timestamptz;
  v_base  timestamptz := p_de;
begin
  if p_so_comercial then
    v_faixa := public.fn_wa_faixa_em(p_instancia, p_de);

    /* Nulo é "este número não tem grade". Não é "está fechado": quem nunca
       configurou horário não quer que a automação fique presa para sempre. */
    if v_faixa is not null and v_faixa <> 'atendimento' then
      select x.quando into v_prox
        from public.fn_wa_proxima_faixa(p_instancia, p_de) x
       where x.faixa = 'atendimento'
       limit 1;
      if v_prox is not null then v_base := v_prox; end if;
    end if;
  end if;

  return public.fn_wa_minuto_livre(p_instancia, v_base);
end $$;

-- ── 2. pôr a mensagem do passo na fila ──────────────────────────────────────
--
-- Vai para `wa_agendadas`, e não direto para a Evolution, de propósito: aquela
-- fila já tem o despachante de minuto, já tem as três tentativas, e já aparece
-- na aba Programadas. Mensagem de robô fica visível no mesmo lugar em que se vê
-- mensagem marcada à mão — que é onde alguém vai procurar quando perguntar "por
-- que esse lead recebeu isso?".
create or replace function public.fn_wa_automacao_enviar(
  p_conversa     uuid,
  p_texto        text,
  p_midias       jsonb default '[]'::jsonb,
  p_so_comercial boolean default true
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inst   text;
  v_quando timestamptz;
  v_id     uuid;
  v_texto  text;
  v_midias jsonb := coalesce(p_midias, '[]'::jsonb);
  m        jsonb;
begin
  select instancia into v_inst from public.wa_conversas where id = p_conversa;
  if v_inst is null then return null; end if;

  v_quando := public.fn_wa_automacao_quando_mandar(v_inst, now(), p_so_comercial);
  v_texto  := public.fn_wa_texto_variaveis(p_conversa, p_texto, v_quando);

  if coalesce(btrim(v_texto), '') = '' and jsonb_array_length(v_midias) = 0 then
    return null;
  end if;

  /* O primeiro anexo carrega as colunas antigas (`midia_path` e irmãs) porque o
     despachante e o check de conteúdo ainda as leem; os demais vão só na lista.
     Mensagem sem anexo é 'texto'. */
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

  return v_id;
end $$;

-- ── 3. esse lead respondeu depois que o fluxo começou? ──────────────────────
--
-- É o que "Parar se respondeu" pergunta. Só conta mensagem de ENTRADA: nossa
-- própria mensagem automática entrando na conta faria todo fluxo parar sozinho
-- no passo seguinte ao primeiro envio.
create or replace function public.fn_wa_automacao_respondeu(
  p_conversa uuid, p_desde timestamptz
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.wa_mensagens m
     where m.conversa_id = p_conversa
       and m.direcao = 'entrada'
       and m.criada_em > p_desde
  );
$$;

revoke execute on function public.fn_wa_automacao_enviar(uuid, text, jsonb, boolean)      from public, anon, authenticated;
revoke execute on function public.fn_wa_automacao_quando_mandar(text, timestamptz, boolean) from public, anon;
grant  execute on function public.fn_wa_automacao_enviar(uuid, text, jsonb, boolean)      to service_role;
grant  execute on function public.fn_wa_automacao_quando_mandar(text, timestamptz, boolean) to service_role, authenticated;
grant  execute on function public.fn_wa_automacao_respondeu(uuid, timestamptz)            to service_role, authenticated;
