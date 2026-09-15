-- TESTAR O FLUXO SEM DEPENDER DA ORDEM DOS ACONTECIMENTOS.
--
-- O primeiro teste de uma automação falhou em silêncio, e a culpa é do desenho,
-- não de quem testou. A sequência foi esta:
--
--   16:19:41  o lead entra na planilha e a sincronização o grava
--   16:20:21  a automação é ligada
--
-- Quarenta segundos de diferença, e a trava do `ligada_em` fez o trabalho dela:
-- evento anterior ao interruptor não dispara. Ela existe por um bom motivo
-- (ligar um fluxo na base do Bradesco dispararia 692 mensagens de uma vez), mas
-- para quem está testando ela é invisível: nada acontece, nada explica.
--
-- O conserto não é afrouxar a trava. É dar um caminho explícito para testar:
-- este é o "Testar agora". Ele ignora o `ligada_em` (e SÓ ele), porque quem
-- aperta o botão está dizendo exatamente o que a trava não consegue adivinhar
-- sozinha: "sim, eu quero este fluxo, neste número, agora".
--
-- O QUE ELE NÃO IGNORA: o teto por dia continua valendo, e a execução fica
-- marcada como teste, para o histórico não misturar o que o robô fez sozinho
-- com o que alguém mandou ele fazer.

alter table public.wa_automacao_execucoes
  add column if not exists teste boolean not null default false;

comment on column public.wa_automacao_execucoes.teste is
  'Disparada a mao pelo botao Testar agora. Ignora a trava de ligada_em e sai fora do horario comercial, porque quem testa quer ver acontecer.';

/**
 * Põe um telefone no fluxo, agora.
 *
 * Diferente do gatilho, esta função é chamada PELA TELA, então ela confere o
 * acesso ao módulo: ela manda mensagem de WhatsApp para um número digitado, e
 * isso não pode ficar aberto a quem só tem login.
 */
create or replace function public.fn_wa_automacao_testar(
  p_automacao uuid,
  p_telefone  text
) returns table (ok boolean, erro text, execucao uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a        record;
  v_tel    text;
  v_conv   uuid;
  v_hoje   int;
  v_id     uuid;
begin
  if not (public.fn_is_admin() or public.tem_modulo('atendimento')) then
    return query select false, 'Sem acesso ao atendimento'::text, null::uuid;
    return;
  end if;

  select * into a from public.wa_automacoes where id = p_automacao;
  if a is null then
    return query select false, 'Automação não encontrada'::text, null::uuid;
    return;
  end if;
  if jsonb_array_length(a.passos) = 0 then
    return query select false, 'Este fluxo não tem passo nenhum'::text, null::uuid;
    return;
  end if;

  v_tel := public.fn_wa_canonico(p_telefone);
  if coalesce(v_tel, '') = '' then
    return query select false, 'Telefone fora do formato brasileiro'::text, null::uuid;
    return;
  end if;

  -- O teto do dia continua valendo: testar não é passe livre para disparar.
  select count(*) into v_hoje
    from public.wa_automacao_execucoes e
   where e.automacao_id = p_automacao
     and e.disparada_em >= date_trunc('day', now());
  if v_hoje >= coalesce((a.condicoes->>'teto_dia')::int, 50) then
    return query select false, 'O teto de hoje já foi atingido'::text, null::uuid;
    return;
  end if;

  /* Se já existe conversa com esse número neste, ela é a conversa do teste: o
     executor não precisa abrir outra, e a mensagem cai onde quem testa vai
     procurar. */
  select c.id into v_conv from public.wa_conversas c
   where lower(c.instancia) = lower(a.instancia) and c.telefone = v_tel
   limit 1;

  insert into public.wa_automacao_execucoes
    (automacao_id, chave, conversa_id, lead_bruto_id, telefone, status, passo, rodar_em, teste, detalhe)
  values
    (p_automacao, 'teste:' || gen_random_uuid()::text, v_conv, null, v_tel,
     'pendente', 0, now(), true, 'disparada a mão pelo botão Testar agora')
  returning id into v_id;

  return query select true, null::text, v_id;
end $$;

grant execute on function public.fn_wa_automacao_testar(uuid, text) to authenticated;

/* A fila passa a dizer se a execução é teste: é o que faz o executor mandar na
   hora em vez de esperar a próxima janela de atendimento. Quem aperta "Testar
   agora" às nove da noite quer ver a mensagem às nove da noite. */
drop function if exists public.fn_wa_automacoes_tomar(int);
create or replace function public.fn_wa_automacoes_tomar(p_limite int default 25)
returns table (
  id uuid, automacao_id uuid, conversa_id uuid, lead_bruto_id uuid,
  telefone text, passo int, tentativas int, disparada_em timestamptz, teste boolean,
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
         a.instancia, a.nome, a.passos, a.condicoes, a.gatilho
    from pegas p join public.wa_automacoes a on a.id = p.automacao_id;
$$;

revoke execute on function public.fn_wa_automacoes_tomar(int) from public, anon, authenticated;
grant  execute on function public.fn_wa_automacoes_tomar(int) to service_role;
