-- REPASSAR UMA CONVERSA DEIXA DE SER MUDAR DE DONO: PASSA A SER DIVIDIR.
--
-- A primeira versão movia a linha: `wa_conversas.instancia` virava o número
-- novo, e a conversa SUMIA da caixa de quem repassou. Duas coisas ruins vinham
-- juntas. Quem atendeu aquela pessoa por três semanas perdia o histórico de
-- vista de um clique pro outro. E, pior, quando o cliente respondia no número
-- antigo — ele não sabe que mudamos, a conversa dele no celular continua sendo
-- a de sempre — o webhook não encontrava linha para (número antigo, telefone) e
-- criava uma NOVA, vazia: a mesma pessoa, duas vezes, uma delas sem passado.
--
-- ─────────────────────── o modelo novo, em três peças ───────────────────────
--
-- 1. GRUPO. As conversas da mesma pessoa em números diferentes ficam LIGADAS
--    por um `grupo_id`. Cada número continua com a sua linha — que é o que faz
--    o webhook seguir funcionando sem saber de nada disto —, e a tela mostra o
--    histórico do grupo inteiro, em ordem, com uma marca onde a custódia mudou.
--
-- 2. CUSTÓDIA. `pode_escrever` diz quem responde. Uma conversa por grupo tem
--    a custódia; as outras ficam legíveis e mudas. Isso é o "meio morto": não é
--    conversa arquivada nem escondida, é conversa que se lê e não se responde.
--
-- 3. O CLIENTE REABRE A PORTA. Se ele escrever no número antigo, aquela
--    mensagem chega lá — e é razão suficiente para aquele número poder
--    responder. Quem decidiu foi o cliente, e recusar seria deixar uma pessoa
--    falando sozinha com um número que não pode responder. Feito por gatilho,
--    porque a mensagem entra por mais de um caminho e a regra não pode morar só
--    no mais fácil de lembrar.
--
-- O QUE ISTO NÃO FAZ: nada disto muda o WhatsApp do cliente. Ele continua com
-- duas conversas no celular, uma por número, e migra de verdade só quando a
-- gente escrever pelo novo. O sistema não finge o contrário.

-- ── 1. o grupo e a custódia ─────────────────────────────────────────────────
alter table public.wa_conversas
  add column if not exists grupo_id uuid,
  /* Sem grupo, TODA conversa escreve — que é como o sistema sempre funcionou e
     como ele continua funcionando para quem nunca repassar nada. */
  add column if not exists pode_escrever boolean not null default true;

comment on column public.wa_conversas.grupo_id is
  'Liga as conversas da mesma pessoa em numeros diferentes. Null = nunca foi repassada.';
comment on column public.wa_conversas.pode_escrever is
  'Quem tem a custodia responde. False = conversa legivel e muda, no numero que repassou.';

create index if not exists ix_wa_conversas_grupo on public.wa_conversas (grupo_id)
  where grupo_id is not null;

-- ── 2. quem tomou conta, e quando ───────────────────────────────────────────
--
-- É o que sustenta "o histórico se mantém perfeito": a linha divisória no meio
-- da conversa — com a foto e o nome de quem assumiu — sai daqui, e não de uma
-- conta feita em cima das mensagens. Repassar de volta, e de novo, e de novo,
-- continua desenhando certo porque cada passagem é uma linha.
create table if not exists public.wa_custodia (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null,
  instancia  text not null,
  /* De onde veio; nulo na primeira, que é o número onde a conversa nasceu. */
  de         text,
  desde      timestamptz not null default clock_timestamp(),
  por        uuid references auth.users(id)
);

comment on table public.wa_custodia is
  'Cada passagem de custodia de um grupo de conversas. E daqui que sai a linha divisoria no historico.';

create index if not exists ix_wa_custodia_grupo on public.wa_custodia (grupo_id, desde);

alter table public.wa_custodia enable row level security;

drop policy if exists "wa_custodia_ler" on public.wa_custodia;
create policy "wa_custodia_ler" on public.wa_custodia
  for select to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'));

/* Sem política de escrita: quem escreve é a função de repasse, SECURITY
   DEFINER. Um log que aceita linha de qualquer lugar não serve para responder
   "quem estava atendendo em agosto?". */

-- ── 3. o cliente escreveu no número mudo: a porta reabre ────────────────────
create or replace function public.fn_wa_reabrir_por_mensagem()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  /* SÓ MENSAGEM DELE REABRE. Uma saída nossa não pode destravar o próprio
     número que está travado — seria a trava se desfazendo por causa do gesto
     que ela existe para impedir. */
  if new.direcao <> 'entrada' then return new; end if;

  update public.wa_conversas
     set pode_escrever = true
   where id = new.conversa_id and pode_escrever = false;

  return new;
end;
$$;

drop trigger if exists trg_wa_reabrir_por_mensagem on public.wa_mensagens;
create trigger trg_wa_reabrir_por_mensagem
  after insert on public.wa_mensagens
  for each row execute function public.fn_wa_reabrir_por_mensagem();

-- ── 4. repassar ─────────────────────────────────────────────────────────────
--
-- Substitui a versão que mudava `instancia` na linha. Agora ela LIGA duas
-- linhas e move a custódia entre elas.
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
  v_origem   public.wa_conversas%rowtype;
  v_grupo    uuid;
  v_destino  uuid;
begin
  if not (public.fn_is_admin() or public.tem_modulo('atendimento')) then
    return query select false, 'Sem acesso ao atendimento'::text, null::uuid;
    return;
  end if;

  select * into v_origem from public.wa_conversas where id = p_conversa for update;
  if not found then
    return query select false, 'Conversa não encontrada'::text, null::uuid;
    return;
  end if;

  if not exists (select 1 from public.wa_instancias i where i.nome ilike p_para and i.ativa) then
    return query select false, format('O número "%s" não está ligado neste sistema.', p_para), null::uuid;
    return;
  end if;

  if v_origem.instancia ilike p_para then
    return query select false, 'A conversa já está nesse número.'::text, null::uuid;
    return;
  end if;

  /* O GRUPO NASCE NO PRIMEIRO REPASSE. Conversa que nunca foi repassada não
     tem grupo, e não precisa: grupo é o que liga DUAS linhas. */
  v_grupo := coalesce(v_origem.grupo_id, gen_random_uuid());

  /* A LINHA DO DESTINO PODE JÁ EXISTIR — e existir é o caso comum quando a
     conversa volta pra um número onde já esteve. Reaproveitar em vez de
     recusar é o que faz o vaivém funcionar: o histórico daquele número
     continua lá, e ele volta a poder escrever. */
  select c.id into v_destino
    from public.wa_conversas c
   where c.instancia ilike p_para and c.telefone = v_origem.telefone;

  if v_destino is null then
    insert into public.wa_conversas (instancia, telefone, jid, nome_wa, foto_url, cliente_id, origem, grupo_id, pode_escrever)
    values (p_para, v_origem.telefone, v_origem.jid, v_origem.nome_wa, v_origem.foto_url,
            v_origem.cliente_id, v_origem.origem, v_grupo, true)
    returning id into v_destino;
  end if;

  -- Todo mundo do grupo entra, e só o destino escreve.
  update public.wa_conversas
     set grupo_id = v_grupo
   where id in (p_conversa, v_destino) or grupo_id = v_grupo;

  update public.wa_conversas
     set pode_escrever = (id = v_destino),
         movida_de  = case when id = v_destino then v_origem.instancia else movida_de end,
         movida_em  = case when id = v_destino then now() else movida_em end,
         movida_por = case when id = v_destino then auth.uid() else movida_por end
   where grupo_id = v_grupo;

  insert into public.wa_custodia (grupo_id, instancia, de, por)
  values (v_grupo, p_para, v_origem.instancia, auth.uid());

  return query select true, null::text, null::uuid;
end;
$$;

comment on function public.fn_wa_mover_conversa is
  'Passa a custodia de uma conversa para outro numero, ligando as duas linhas num grupo. A antiga fica legivel e muda.';

revoke all on function public.fn_wa_mover_conversa(uuid, text) from public;
grant execute on function public.fn_wa_mover_conversa(uuid, text) to authenticated;

/* ── 5. as sete conversas que a versão antiga já moveu ──────────────────────
   Elas tiveram a `instancia` trocada e a linha do número de origem não existe
   mais. Não dá pra recriar o que não foi gravado; o que dá é registrar a
   custódia atual, pra elas aparecerem certas daqui pra frente. */
insert into public.wa_custodia (grupo_id, instancia, de)
select gen_random_uuid(), c.instancia, c.movida_de
  from public.wa_conversas c
 where c.movida_de is not null and c.grupo_id is null;

update public.wa_conversas c
   set grupo_id = k.grupo_id
  from public.wa_custodia k
 where c.movida_de is not null and c.grupo_id is null
   and k.instancia = c.instancia and k.de = c.movida_de;
