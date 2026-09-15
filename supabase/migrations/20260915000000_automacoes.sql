-- AUTOMAÇÕES DO ATENDIMENTO — "quando acontece X, faça Y", num lugar só.
--
-- O atendimento já automatizava antes desta tabela: a régua de follow-up, a
-- mensagem de primeiro contato por faixa de horário, a jornada que anda sozinha
-- quando chega um PDF. Três tabelas, três telas, e nenhuma delas legível como a
-- frase que quem atende de fato pensa. Pior: nada disso cobria o pedido mais
-- óbvio, que é a base de leads encher e a pessoa receber mensagem.
--
-- ───────────────────────────── as três peças ────────────────────────────────
--
--   wa_automacoes            a regra: gatilho, condições e a fila de passos
--   wa_automacao_execucoes   uma linha por lead que passou (ou está passando)
--   fn_wa_automacao_*        os gatilhos, a tomada da fila e o desfecho
--
-- O EXECUTOR NÃO MORA AQUI. Quem roda os passos é a edge function
-- `wa-automacoes`, chamada pelo cron de minuto. O motivo é o primeiro passo do
-- gatilho da base: o lead da planilha não tem conversa, e abrir conversa exige
-- perguntar à Evolution se o número existe — que é HTTP, e HTTP não se faz de
-- dentro de um gatilho de banco sem transformar cada INSERT numa aposta.
--
-- Por isso o gatilho só ENFILEIRA. Ele é barato, é transacional, e se o
-- executor estiver fora do ar a fila espera em vez de se perder.
--
-- ────────────────────────── as travas, e por quê ────────────────────────────
--
-- Automação que manda mensagem para gente de verdade erra caro, e erra em
-- lote. São quatro travas, e cada uma existe por um jeito conhecido de errar:
--
--   1. NASCE DESLIGADA. `ativa` começa false. Ninguém liga uma automação sem
--      querer no meio de escrevê-la.
--   2. SÓ VALE DAQUI PRA FRENTE. `ligada_em` marca quando o interruptor foi
--      ligado, e evento anterior a isso não dispara. Sem essa trava, ligar uma
--      automação numa base que já tem 635 linhas dispararia 635 mensagens de
--      uma vez, para gente que chegou meses atrás.
--   3. TETO POR DIA. `teto_dia` limita quantos leads o mesmo fluxo pega por
--      dia. É a rede embaixo da trava 2: se alguém colar 600 linhas novas na
--      planilha de uma vez, saem as primeiras e as outras ficam para amanhã,
--      em vez de o número ser derrubado por disparo em massa.
--   4. UMA VEZ POR ACONTECIMENTO. Cada execução carrega uma `chave` (o lead da
--      planilha, a etapa em que entrou, o dia do silêncio) e o índice único
--      recusa a segunda. É o que faz o gatilho poder ser burro e a fila,
--      exata.
--
-- E o envio em si continua passando por `wa_agendadas`, que já espaça um
-- minuto entre mensagens do mesmo número (`fn_wa_minuto_livre`) e já aparece na
-- aba Programadas — ou seja, mensagem de robô é visível no mesmo lugar em que
-- se vê mensagem marcada à mão.

-- ── 1. a regra ──────────────────────────────────────────────────────────────

create table if not exists public.wa_automacoes (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null check (length(btrim(nome)) > 0),
  /* De um NÚMERO, e não do escritório. É o mesmo eixo da régua, da grade de
     horário e das mensagens de faixa: quem atende por dois números quer
     cadências diferentes, e uma automação do escritório inteiro obrigaria os
     dois a concordarem. */
  instancia       text not null,
  ativa           boolean not null default false,
  ligada_em       timestamptz,

  gatilho         text not null check (gatilho in
                    ('lead_novo_na_base','etapa_mudou','mensagem_recebida','sem_resposta','virou_cliente')),
  gatilho_config  jsonb not null default '{}'::jsonb,

  /* { so_horario_comercial: bool, teto_dia: int } — espelho de CONDICOES_PADRAO
     em src/lib/automacoes.ts. */
  condicoes       jsonb not null default '{"so_horario_comercial": true, "teto_dia": 50}'::jsonb,

  /* A fila de passos, na ordem. O formato de cada passo está em
     src/lib/automacoes.ts (`Passo`) e é conferido lá e no executor; aqui só se
     exige que seja uma lista, porque um objeto solto quebraria o executor no
     meio de um lote. */
  passos          jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(passos) = 'array'),

  criada_por      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.wa_automacoes is
  'Regras de automacao do atendimento: gatilho, condicoes e fila de passos. Executadas pela edge function wa-automacoes.';
comment on column public.wa_automacoes.ligada_em is
  'Quando o interruptor foi ligado. Evento anterior a isso nao dispara: e o que impede uma base antiga de disparar tudo de uma vez ao ligar.';

create index if not exists ix_wa_automacoes_ativas
  on public.wa_automacoes (instancia, gatilho) where ativa;

drop trigger if exists set_updated_at_wa_automacoes on public.wa_automacoes;
create trigger set_updated_at_wa_automacoes
  before update on public.wa_automacoes
  for each row execute function public.set_updated_at();

/* `ligada_em` é escrito pelo banco e não pela tela: é uma trava de segurança, e
   trava que o cliente preenche não é trava. Desligar limpa, para que religar
   amanhã não ressuscite os eventos de hoje. */
create or replace function public.fn_wa_automacao_ligada_em()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.ativa and not coalesce(old.ativa, false) then
    new.ligada_em := now();
  elsif not new.ativa then
    new.ligada_em := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_wa_automacao_ligada_em on public.wa_automacoes;
create trigger trg_wa_automacao_ligada_em
  before insert or update of ativa on public.wa_automacoes
  for each row execute function public.fn_wa_automacao_ligada_em();

-- ── 2. quem passou pelo fluxo ───────────────────────────────────────────────

create table if not exists public.wa_automacao_execucoes (
  id            uuid primary key default gen_random_uuid(),
  automacao_id  uuid not null references public.wa_automacoes(id) on delete cascade,

  /* Nos gatilhos que partem de uma conversa, ela já vem preenchida. No gatilho
     da base ela nasce nula: a conversa é aberta pelo executor, no primeiro
     passo, e gravada aqui depois. */
  conversa_id   uuid references public.wa_conversas(id) on delete cascade,
  lead_bruto_id uuid references public.leads_brutos(id) on delete set null,
  telefone      text,

  /* O ACONTECIMENTO, em uma string. "lead:<uuid>", "etapa:<conversa>:<etapa>",
     "silencio:<conversa>:<dia>". O índice único abaixo usa isto, e é por isso
     que cada gatilho pode simplesmente mandar enfileirar sem antes perguntar
     se já mandou. */
  chave         text not null,

  status        text not null default 'pendente'
                  check (status in ('pendente','rodando','concluida','falhou','parada')),
  /* Em qual passo da fila ela está. Uma execução que espera dois dias sai da
     máquina e volta depois: é este número que diz de onde retomar. */
  passo         int not null default 0,
  detalhe       text,
  erro          text,
  tentativas    int not null default 0,

  disparada_em  timestamptz not null default now(),
  rodar_em      timestamptz not null default now(),
  terminada_em  timestamptz
);

comment on table public.wa_automacao_execucoes is
  'Uma linha por lead que entrou num fluxo. E o historico que a aba Execucoes mostra e o que o executor usa para retomar de onde parou.';
comment on column public.wa_automacao_execucoes.chave is
  'O acontecimento que disparou, em texto. Unico por automacao: e a trava que impede a mesma pessoa de entrar duas vezes no mesmo fluxo pelo mesmo motivo.';

create index if not exists ix_wa_automacao_exec_fila
  on public.wa_automacao_execucoes (rodar_em) where status = 'pendente';
create index if not exists ix_wa_automacao_exec_automacao
  on public.wa_automacao_execucoes (automacao_id, disparada_em desc);
create index if not exists ix_wa_automacao_exec_conversa
  on public.wa_automacao_execucoes (conversa_id) where conversa_id is not null;

create unique index if not exists ux_wa_automacao_exec_chave
  on public.wa_automacao_execucoes (automacao_id, chave);

-- ── 3. RLS ──────────────────────────────────────────────────────────────────

alter table public.wa_automacoes          enable row level security;
alter table public.wa_automacao_execucoes enable row level security;

drop policy if exists wa_automacoes_modulo on public.wa_automacoes;
create policy wa_automacoes_modulo on public.wa_automacoes
  for all to authenticated
  /* `(select ...)` e não a chamada nua: sem isto o Postgres avalia a função uma
     vez POR LINHA, e foi assim que a tabela do Spy passou a estourar o relógio
     de 8 segundos. Aqui são poucas linhas, mas a forma certa é a mesma e não
     custa nada. */
  using ((select public.fn_is_admin()) or (select public.tem_modulo('atendimento')))
  with check ((select public.fn_is_admin()) or (select public.tem_modulo('atendimento')));

/* Execução é LEITURA para quem atende: quem escreve é o executor, com a chave
   de serviço. Deixar a tela escrever aqui abriria a porta para "concluir" uma
   execução na mão, e o histórico do que o robô fez pararia de ser histórico. */
drop policy if exists wa_automacao_exec_leitura on public.wa_automacao_execucoes;
create policy wa_automacao_exec_leitura on public.wa_automacao_execucoes
  for select to authenticated
  using ((select public.fn_is_admin()) or (select public.tem_modulo('atendimento')));

-- ── 4. o coração: enfileirar, respeitando as travas ─────────────────────────

/**
 * Enfileira uma execução, se houver o que enfileirar.
 *
 * Devolve o id criado, ou nulo quando alguma trava barrou. Nulo aqui é o caso
 * NORMAL, não o excepcional: a maioria dos eventos do sistema não casa com
 * nenhuma automação ligada, e o mesmo acontecimento chega mais de uma vez.
 */
create or replace function public.fn_wa_automacao_enfileirar(
  p_automacao   uuid,
  p_chave       text,
  p_conversa    uuid,
  p_lead_bruto  uuid,
  p_telefone    text,
  p_quando      timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a       record;
  v_hoje  int;
  v_id    uuid;
begin
  select * into a from public.wa_automacoes where id = p_automacao;
  if a is null or not a.ativa then return null; end if;

  -- trava 2: evento anterior ao interruptor não conta
  if a.ligada_em is null or p_quando < a.ligada_em then return null; end if;

  -- sem passos, o fluxo não faria nada e encheria o histórico de linhas vazias
  if jsonb_array_length(a.passos) = 0 then return null; end if;

  -- trava 3: teto por dia
  select count(*) into v_hoje
    from public.wa_automacao_execucoes e
   where e.automacao_id = p_automacao
     and e.disparada_em >= date_trunc('day', now());
  if v_hoje >= coalesce((a.condicoes->>'teto_dia')::int, 50) then
    return null;
  end if;

  insert into public.wa_automacao_execucoes
    (automacao_id, chave, conversa_id, lead_bruto_id, telefone, status, passo, rodar_em)
  values
    (p_automacao, p_chave, p_conversa, p_lead_bruto, p_telefone, 'pendente', 0, now())
  /* trava 4: a segunda tentativa do mesmo acontecimento não é erro, é o índice
     fazendo o trabalho dele. */
  on conflict (automacao_id, chave) do nothing
  returning id into v_id;

  return v_id;
end $$;

/** As automações ligadas de um número para um gatilho. */
create or replace function public.fn_wa_automacoes_de(p_instancia text, p_gatilho text)
returns setof public.wa_automacoes
language sql
stable
security definer
set search_path to 'public'
as $$
  select * from public.wa_automacoes
   where ativa and gatilho = p_gatilho and lower(instancia) = lower(p_instancia);
$$;

-- ── 5. gatilho: lead novo na base ───────────────────────────────────────────

/*
 * A planilha ganhou uma linha.
 *
 * Só INSERT: a sincronização é um upsert, e linha que já existia volta como
 * UPDATE. Sem essa distinção, toda leitura da planilha reabriria o fluxo para a
 * base inteira.
 */
create or replace function public.fn_wa_automacao_lead_novo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inst text;
  a      record;
begin
  select f.instancia into v_inst
    from public.leads_fontes f where f.id = new.fonte_id;
  if v_inst is null then return new; end if;

  for a in select * from public.fn_wa_automacoes_de(v_inst, 'lead_novo_na_base') loop
    /* Base escolhida na configuração do gatilho. Lista vazia quer dizer
       "qualquer base deste número", que é o padrão de quem tem uma base só. */
    if jsonb_array_length(coalesce(a.gatilho_config->'fonte_ids', '[]'::jsonb)) = 0
       or (a.gatilho_config->'fonte_ids') ? new.fonte_id::text then
      perform public.fn_wa_automacao_enfileirar(
        a.id, 'lead:' || new.id::text, null, new.id, new.telefone, now());
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_wa_automacao_lead_novo on public.leads_brutos;
create trigger trg_wa_automacao_lead_novo
  after insert on public.leads_brutos
  for each row execute function public.fn_wa_automacao_lead_novo();

-- ── 6. gatilho: mudou de etapa ──────────────────────────────────────────────

create or replace function public.fn_wa_automacao_etapa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a record;
begin
  if new.etapa is null or new.etapa is not distinct from old.etapa then return new; end if;

  for a in select * from public.fn_wa_automacoes_de(new.instancia, 'etapa_mudou') loop
    if jsonb_array_length(coalesce(a.gatilho_config->'etapas', '[]'::jsonb)) = 0
       or (a.gatilho_config->'etapas') ? new.etapa then
      /* A chave inclui a etapa: entrar em "proposta" e depois em "fechado" são
         dois acontecimentos, e o mesmo salto repetido é um só. */
      perform public.fn_wa_automacao_enfileirar(
        a.id, 'etapa:' || new.id::text || ':' || new.etapa, new.id, null, new.telefone, now());
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_wa_automacao_etapa on public.wa_conversas;
create trigger trg_wa_automacao_etapa
  after update of etapa on public.wa_conversas
  for each row execute function public.fn_wa_automacao_etapa();

-- ── 7. gatilho: virou cliente ───────────────────────────────────────────────

create or replace function public.fn_wa_automacao_virou_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a record;
begin
  if new.virou_cliente_em is null or old.virou_cliente_em is not null then return new; end if;

  for a in select * from public.fn_wa_automacoes_de(new.instancia, 'virou_cliente') loop
    perform public.fn_wa_automacao_enfileirar(
      a.id, 'cliente:' || new.id::text, new.id, null, new.telefone, now());
  end loop;

  return new;
end $$;

drop trigger if exists trg_wa_automacao_virou_cliente on public.wa_conversas;
create trigger trg_wa_automacao_virou_cliente
  after update of virou_cliente_em on public.wa_conversas
  for each row execute function public.fn_wa_automacao_virou_cliente();

-- ── 8. gatilho: mensagem recebida ───────────────────────────────────────────

create or replace function public.fn_wa_automacao_mensagem()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c      record;
  a      record;
  v_txt  text;
begin
  if new.direcao <> 'entrada' then return new; end if;

  select cv.id, cv.instancia, cv.telefone into c
    from public.wa_conversas cv where cv.id = new.conversa_id;
  if c.id is null then return new; end if;

  v_txt := coalesce(new.texto, '');

  for a in select * from public.fn_wa_automacoes_de(c.instancia, 'mensagem_recebida') loop
    if coalesce(btrim(a.gatilho_config->>'contendo'), '') = ''
       or v_txt ilike '%' || btrim(a.gatilho_config->>'contendo') || '%' then
      /* Sem entrar de novo enquanto a anterior ainda roda: quem manda três
         mensagens seguidas está falando, não pedindo três fluxos. A chave é a
         MENSAGEM, e a checagem de "já tem uma rodando" é o que evita a
         repetição — as duas coisas juntas, porque a chave sozinha deixaria
         passar a segunda mensagem e a checagem sozinha deixaria passar duas
         gravadas no mesmo instante. */
      if not exists (
        select 1 from public.wa_automacao_execucoes e
         where e.automacao_id = a.id and e.conversa_id = c.id
           and e.status in ('pendente','rodando')
      ) then
        perform public.fn_wa_automacao_enfileirar(
          a.id, 'msg:' || new.id::text, c.id, null, c.telefone, now());
      end if;
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_wa_automacao_mensagem on public.wa_mensagens;
create trigger trg_wa_automacao_mensagem
  after insert on public.wa_mensagens
  for each row execute function public.fn_wa_automacao_mensagem();

-- ── 9. gatilho de tempo: sem resposta há N dias ─────────────────────────────

/*
 * Este não pode ser gatilho de tabela: o acontecimento é a AUSÊNCIA de linha
 * nova. Quem pergunta é o cron, junto com o executor.
 *
 * A definição de "sem resposta" é a única que não ambigua: a última mensagem da
 * conversa é NOSSA. Se a última é dela, ela respondeu — não importa há quantos
 * dias. A chave leva o DIA, então um lead que segue calado volta a disparar na
 * próxima janela em vez de uma vez só na vida.
 */
create or replace function public.fn_wa_automacoes_varrer()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a      record;
  c      record;
  v_n    int := 0;
  v_dias int;
begin
  for a in select * from public.wa_automacoes
            where ativa and gatilho = 'sem_resposta' and ligada_em is not null loop
    v_dias := greatest(1, least(coalesce((a.gatilho_config->>'dias')::int, 3), 365));

    for c in
      select cv.id, cv.telefone
        from public.wa_conversas cv
       where lower(cv.instancia) = lower(a.instancia)
         and not cv.arquivada
         and cv.situacao = 'lead'
         and cv.ultima_em <= now() - make_interval(days => v_dias)
         and cv.ultima_em >= a.ligada_em
         and (select m.direcao from public.wa_mensagens m
               where m.conversa_id = cv.id
               order by m.criada_em desc limit 1) = 'saida'
         and not exists (
           select 1 from public.wa_automacao_execucoes e
            where e.automacao_id = a.id and e.conversa_id = cv.id
              and e.status in ('pendente','rodando')
         )
       limit 200
    loop
      if public.fn_wa_automacao_enfileirar(
           a.id,
           'silencio:' || c.id::text || ':' || to_char(now(), 'YYYY-MM-DD'),
           c.id, null, c.telefone, now()) is not null then
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;

  return v_n;
end $$;

-- ── 10. a fila: tomar e devolver ────────────────────────────────────────────

/**
 * Pega o que está vencido e marca como 'rodando', numa tacada.
 *
 * Mesmo desenho da fila de mensagens (`fn_wa_agendadas_tomar`): o UPDATE que
 * marca é o mesmo comando que devolve a lista, então duas chamadas simultâneas
 * do cron não pegam a mesma execução.
 */
create or replace function public.fn_wa_automacoes_tomar(p_limite int default 25)
returns table (
  id uuid, automacao_id uuid, conversa_id uuid, lead_bruto_id uuid,
  telefone text, passo int, tentativas int, disparada_em timestamptz,
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
        for update skip locked
     )
    returning e.*
  )
  select p.id, p.automacao_id, p.conversa_id, p.lead_bruto_id,
         p.telefone, p.passo, p.tentativas, p.disparada_em,
         a.instancia, a.nome, a.passos, a.condicoes, a.gatilho
    from pegas p
    join public.wa_automacoes a on a.id = p.automacao_id;
$$;

/**
 * O que aconteceu com a execução.
 *
 * `p_passo` com `p_rodar_em` no futuro é o caso da espera: a execução volta
 * para 'pendente' e some da máquina até a hora. É assim que "espere dois dias"
 * não segura nada ligado durante dois dias.
 */
create or replace function public.fn_wa_automacao_desfecho(
  p_id            uuid,
  p_status        text,
  p_passo         int default null,
  p_rodar_em      timestamptz default null,
  p_conversa      uuid default null,
  p_detalhe       text default null,
  p_erro          text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.wa_automacao_execucoes
     set status       = p_status,
         passo        = coalesce(p_passo, passo),
         rodar_em     = coalesce(p_rodar_em, rodar_em),
         conversa_id  = coalesce(p_conversa, conversa_id),
         detalhe      = coalesce(p_detalhe, detalhe),
         erro         = case when p_status = 'falhou' then p_erro else null end,
         terminada_em = case when p_status in ('concluida','falhou','parada') then now() else null end
   where id = p_id;
end $$;

/* SÓ O EXECUTOR MEXE NA FILA. Mesmo desenho da fila de mensagens: uma tela que
   pudesse "tomar" uma execução conseguiria fazer o mesmo fluxo rodar duas
   vezes, e o lead receberia tudo em dobro. */
revoke execute on function public.fn_wa_automacoes_tomar(int)                                              from public, anon, authenticated;
revoke execute on function public.fn_wa_automacao_desfecho(uuid, text, int, timestamptz, uuid, text, text)  from public, anon, authenticated;
revoke execute on function public.fn_wa_automacoes_varrer()                                                from public, anon, authenticated;
revoke execute on function public.fn_wa_automacao_enfileirar(uuid, text, uuid, uuid, text, timestamptz)    from public, anon, authenticated;
grant  execute on function public.fn_wa_automacoes_tomar(int)                                              to service_role;
grant  execute on function public.fn_wa_automacao_desfecho(uuid, text, int, timestamptz, uuid, text, text)  to service_role;
grant  execute on function public.fn_wa_automacoes_varrer()                                                to service_role;

-- ── 11. o resumo que a lista de automações mostra ───────────────────────────

/**
 * Quantos passaram por cada fluxo, e quantos passaram hoje.
 *
 * Vem do banco e não do navegador porque a tela só carrega as últimas
 * execuções: contar "quantos já passaram" com essa lista daria o número da
 * página, não o do fluxo.
 */
create or replace function public.fn_wa_automacoes_resumo(p_instancia text)
returns table (automacao_id uuid, total bigint, hoje bigint, falhas bigint, ultima timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id,
         count(e.id),
         count(e.id) filter (where e.disparada_em >= date_trunc('day', now())),
         count(e.id) filter (where e.status = 'falhou'),
         max(e.disparada_em)
    from public.wa_automacoes a
    left join public.wa_automacao_execucoes e on e.automacao_id = a.id
   where lower(a.instancia) = lower(p_instancia)
   group by a.id;
$$;
