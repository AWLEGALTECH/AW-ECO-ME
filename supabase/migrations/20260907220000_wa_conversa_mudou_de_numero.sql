-- PASSAR UM ATENDIMENTO DE UM NÚMERO PARA OUTRO.
--
-- Acontece o tempo todo e não tinha caminho: o lead entrou pelo Portal, virou
-- caso do escritório, e daqui pra frente quem fala com ele é o Dr. Matheus, do
-- número dele. Até aqui a única saída era pedir pro cliente salvar outro número
-- e recomeçar a conversa do zero — e recomeçar do zero significa perder o
-- histórico exatamente no momento em que ele passa a valer mais.
--
-- ─────────────────────────── o que a mudança é ──────────────────────────────
--
-- É trocar `instancia` na linha da conversa. Daí em diante o que sai, sai pelo
-- número novo, e a conversa aparece na caixa dele. O histórico fica: ele é
-- nosso, não do número.
--
-- ⚠️ O QUE ELA NÃO É, e a tela precisa dizer: o cliente não sabe que mudamos de
-- número. Se ele responder na conversa antiga do celular dele, a mensagem chega
-- no número antigo — e o webhook, que casa por (instancia, telefone), vai abrir
-- uma linha NOVA lá. Não é defeito a corrigir aqui: é como o WhatsApp funciona,
-- e o único jeito de o cliente migrar é a gente escrever primeiro pelo número
-- novo. O que dá pra fazer é não deixar isso ser descoberto por acidente, e por
-- isso a mudança fica registrada.
--
-- O REGISTRO É O PONTO. Sem ele, uma conversa que reaparece na caixa do Portal
-- três dias depois parece bug, e a que está na caixa do Matheus parece ter
-- nascido lá. Com ele, as duas telas conseguem dizer de onde a conversa veio e
-- quando.
alter table public.wa_conversas
  add column if not exists movida_de  text,
  add column if not exists movida_em  timestamptz,
  add column if not exists movida_por uuid references auth.users(id);

comment on column public.wa_conversas.movida_de is
  'Instancia de onde esta conversa veio, quando alguem a passou de numero. Null = sempre esteve onde esta.';

/* A MUDANÇA É UMA FUNÇÃO, e não um update solto da tela, por causa de uma
   pergunta que só o banco consegue responder sem correr risco: a conversa cabe
   lá? `wa_conversas` tem UNIQUE (instancia, telefone), então mover para um
   número que JÁ falou com essa pessoa é uma violação de constraint — e a tela
   receberia "duplicate key value violates unique constraint", que não diz nada
   a ninguém.

   Fazendo aqui, a checagem e a escrita acontecem na mesma transação: entre
   perguntar e mover não cabe a mensagem que criaria a linha concorrente. */
create or replace function public.fn_wa_mover_conversa(
  p_conversa uuid,
  p_para     text
)
returns table (ok boolean, erro text, conversa_existente uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_de       text;
  v_telefone text;
  v_choque   uuid;
begin
  if not (public.fn_is_admin() or public.tem_modulo('atendimento')) then
    return query select false, 'Sem acesso ao atendimento'::text, null::uuid;
    return;
  end if;

  select c.instancia, c.telefone into v_de, v_telefone
    from public.wa_conversas c where c.id = p_conversa
    for update;

  if v_de is null then
    return query select false, 'Conversa não encontrada'::text, null::uuid;
    return;
  end if;

  -- O nome tem que ser de um número que ESTE sistema conhece. A Evolution é
  -- compartilhada com outros projetos, e mover para uma instância de fora
  -- faria a conversa sumir da tela sem ter ido pra lugar nenhum.
  if not exists (select 1 from public.wa_instancias i where i.nome ilike p_para and i.ativa) then
    return query select false, format('O número "%s" não está ligado neste sistema.', p_para), null::uuid;
    return;
  end if;

  if v_de ilike p_para then
    return query select false, 'A conversa já está nesse número.'::text, null::uuid;
    return;
  end if;

  select c.id into v_choque
    from public.wa_conversas c
   where c.instancia ilike p_para and c.telefone = v_telefone;

  if v_choque is not null then
    /* JÁ EXISTE CONVERSA COM ESSA PESSOA LÁ. Juntar as duas seria a resposta
       bonita e é justamente a que não dá pra dar em silêncio: as duas têm
       histórico, etapa, cobrança e mensagens marcadas próprias, e escolher qual
       sobrevive é decisão de quem atende. A função devolve o id da outra pra
       tela poder abrir e deixar a pessoa decidir. */
    return query select false,
      'Esse número já tem uma conversa com esse contato.'::text, v_choque;
    return;
  end if;

  update public.wa_conversas
     set instancia  = p_para,
         movida_de  = v_de,
         movida_em  = now(),
         movida_por = auth.uid()
   where id = p_conversa;

  return query select true, null::text, null::uuid;
end;
$$;

comment on function public.fn_wa_mover_conversa is
  'Passa uma conversa para outro numero. Recusa com motivo legivel quando o destino nao existe ou ja tem conversa com o mesmo contato.';

revoke all on function public.fn_wa_mover_conversa(uuid, text) from public;
grant execute on function public.fn_wa_mover_conversa(uuid, text) to authenticated;
