-- ═══════════════════════════════════════════════════════════════════════════
-- "JÁ NOS ESCREVEU" É SOBRE A PESSOA, E NÃO SOBRE O CANAL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A pergunta do passo "Se" olhava UMA conversa: a do número em que o fluxo
-- roda. Parecia óbvio e está errado, e o dado real mostrou o tamanho do erro.
--
-- A base Leads Bradesco está ligada no PDA OUTBOUND. Dos 708 leads dela, 71 já
-- escreveram para o escritório — e 60 desses escreveram para o PDA INBOUND,
-- que é outro número. Para o fluxo, que abre conversa no OUTBOUND e pergunta
-- "esta conversa tem mensagem de entrada?", os 60 nunca falaram com ninguém.
-- Cada um deles receberia "Oi, vi que você preencheu nosso formulário" depois
-- de já estar conversando com a gente no outro número.
--
-- É o caso exato que motivou o passo "Se" existir, falhando pelo motivo mais
-- banal: a pessoa não sabe que temos dois números, e não tinha por que saber.
--
-- A correção é procurar por TELEFONE, em qualquer instância. O mesmo vale para
-- "respondeu depois que o fluxo começou": se mandamos no OUTBOUND e a pessoa
-- respondeu no INBOUND, ela respondeu. Parar o fluxo é o certo.

create or replace function public.fn_wa_automacao_respondeu(p_conversa uuid, p_desde timestamptz)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.wa_conversas alvo
      join public.wa_conversas c on c.telefone = alvo.telefone
      join public.wa_mensagens m on m.conversa_id = c.id
     where alvo.id = p_conversa
       and m.direcao = 'entrada'
       and m.criada_em > p_desde);
$$;

revoke execute on function public.fn_wa_automacao_respondeu(uuid, timestamptz) from public, anon;
grant  execute on function public.fn_wa_automacao_respondeu(uuid, timestamptz) to service_role, authenticated;

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
    /* Por TELEFONE, e não pela conversa: a pessoa é a mesma nos dois números,
       e é sobre a pessoa que se está perguntando. */
    return exists (
      select 1
        from public.wa_conversas alvo
        join public.wa_conversas c on c.telefone = alvo.telefone
        join public.wa_mensagens m on m.conversa_id = c.id
       where alvo.id = p_conversa
         and m.direcao = 'entrada');
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
    return v_alvo <> '' and position(v_alvo in lower(v_valor)) > 0;
  end if;

  return false;
end $$;

revoke execute on function public.fn_wa_automacao_condicao(uuid, timestamptz, jsonb) from public, anon;
grant  execute on function public.fn_wa_automacao_condicao(uuid, timestamptz, jsonb) to service_role, authenticated;
