-- PRIMEIRO ATENDIMENTO: o que o lead ouve quando escreve pela primeira vez.
--
-- O dia do escritório tem três estados, e hoje o lead não sabe em qual caiu:
--   fechado         ninguém vai ler isso agora
--   direcionamento  já estamos de pé, o responsável começa às tantas
--   atendimento     tem gente aqui, e a resposta vem
--
-- A GRADE GUARDA SÓ O QUE EXISTE. Faixa é direcionamento ou atendimento;
-- fechado é a AUSÊNCIA de faixa. Guardar as três faria toda mudança precisar
-- acertar vizinhas para não deixar buraco nem sobreposição, e um buraco de dois
-- minutos às 8h seria um lead sem resposta que ninguém consegue explicar.
--
-- SÓ LEAD NOVO. A resposta automática é uma apresentação, e apresentação se faz
-- uma vez: quem já conversou conosco antes escreve à noite e não recebe robô.
-- `wa_conversas.primeiro_atendimento_em` é o carimbo que garante isso, e ele
-- também é a trava contra o duplo envio.
--
-- A FILA É DE UM POR MINUTO, POR NÚMERO. Quando o escritório abre, dez leads da
-- madrugada esperam a mesma mensagem: mandar as dez no mesmo minuto é o padrão
-- de disparo em massa que derruba número. `fn_wa_minuto_livre` empurra cada uma
-- para o minuto seguinte ao da última já marcada.
--
-- O HORÁRIO É O DE MANAUS, e não o do servidor. Sem isto a grade das 8h abriria
-- meia-noite no fuso do Postgres.

-- ── 1. a configuração de cada número ────────────────────────────────────────
create table if not exists public.wa_atendimento_config (
  instancia   text primary key,
  -- Desligado, nada disto acontece: é o interruptor geral, e ele nasce
  -- desligado para a grade ser escrita antes de a primeira mensagem sair.
  ativo       boolean not null default false,
  fuso        text not null default 'America/Manaus',
  -- O feriado é uma DATA, e não um sim/não: assim ele se apaga sozinho amanhã,
  -- em vez de ficar ligado até alguém lembrar de desligar.
  fechado_em  date,
  -- "Estou fora agora": rebaixa o atendimento real para direcionamento sem
  -- mexer na grade. Horário fixo e reunião fora do escritório não se combinam.
  fora_agora  boolean not null default false,
  fora_desde  timestamptz,
  atualizado_por uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

comment on table public.wa_atendimento_config is
  'Interruptores do primeiro atendimento automatico de cada numero.';

-- ── 2. a grade ──────────────────────────────────────────────────────────────
create table if not exists public.wa_horarios (
  id        uuid primary key default gen_random_uuid(),
  instancia text not null,
  -- 0 = domingo, como o `dow` do Postgres: a tradução some e o bug de um dia
  -- de diferença com ela.
  dia       int  not null check (dia between 0 and 6),
  inicio    time not null,
  fim       time not null,
  faixa     text not null check (faixa in ('direcionamento', 'atendimento')),
  constraint wa_horarios_ordem check (fim > inicio)
);

create index if not exists ix_wa_horarios_busca on public.wa_horarios (instancia, dia, inicio);

comment on table public.wa_horarios is
  'Faixas de horario por numero e dia. O que nao esta coberto por nenhuma faixa e fechado.';

-- ── 3. as três mensagens ────────────────────────────────────────────────────
-- Mesma forma dos modelos de follow-up e dos atalhos: `midias` com a lista e as
-- colunas soltas espelhando o primeiro item. `src/lib/anexos.ts` já lê assim.
create table if not exists public.wa_atendimento_msgs (
  instancia  text not null,
  faixa      text not null check (faixa in ('fechado', 'direcionamento', 'atendimento')),
  tipo       text not null default 'texto'
             check (tipo in ('texto', 'imagem', 'video', 'documento', 'audio')),
  texto      text,
  midia_path text,
  midia_mime text,
  midia_nome text,
  duracao    int,
  midias     jsonb not null default '[]'::jsonb,
  atualizado_por uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (instancia, faixa)
);

comment on table public.wa_atendimento_msgs is
  'A mensagem de cada faixa. Vazia (sem texto e sem midia) quer dizer: nao mande nada nessa faixa.';

alter table public.wa_conversas
  add column if not exists primeiro_atendimento_em timestamptz;
comment on column public.wa_conversas.primeiro_atendimento_em is
  'Quando esta conversa recebeu o primeiro atendimento automatico. Preenchido = nunca mais.';

-- ── 4. RLS: mesmo portão do resto do atendimento ────────────────────────────
alter table public.wa_atendimento_config enable row level security;
alter table public.wa_horarios           enable row level security;
alter table public.wa_atendimento_msgs   enable row level security;

drop policy if exists wa_atendimento_config_modulo on public.wa_atendimento_config;
create policy wa_atendimento_config_modulo on public.wa_atendimento_config
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));

drop policy if exists wa_horarios_modulo on public.wa_horarios;
create policy wa_horarios_modulo on public.wa_horarios
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));

drop policy if exists wa_atendimento_msgs_modulo on public.wa_atendimento_msgs;
create policy wa_atendimento_msgs_modulo on public.wa_atendimento_msgs
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));

-- ── 5. qual faixa vale agora ────────────────────────────────────────────────
-- Espelho de `faixaEm` em src/lib/horarioAtendimento.ts, que é quem desenha a
-- grade na tela. Esta é a que MANDA; a de lá é para a tela poder dizer "agora:
-- fechado" sem perguntar ao servidor.
create or replace function public.fn_wa_faixa_em(p_instancia text, p_quando timestamptz default now())
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  c      record;
  local  timestamp;
  achada text;
begin
  select * into c from public.wa_atendimento_config where instancia = p_instancia;
  if c is null or not c.ativo then return null; end if;

  local := p_quando at time zone c.fuso;

  if c.fechado_em is not null and c.fechado_em = local::date then return 'fechado'; end if;

  select h.faixa into achada
    from public.wa_horarios h
   where h.instancia = p_instancia
     and h.dia = extract(dow from local)::int
     and local::time >= h.inicio
     and local::time <  h.fim
   -- Sobreposição não deveria existir (a tela impede), e se existir o
   -- atendimento real ganha: errar para o lado de "tem gente aqui" é melhor
   -- que mandar um "estamos fechados" com o escritório cheio.
   order by (h.faixa = 'atendimento') desc
   limit 1;

  if achada is null then return 'fechado'; end if;
  if c.fora_agora and achada = 'atendimento' then return 'direcionamento'; end if;
  return achada;
end $function$;

-- ── 6. quando abre a próxima faixa ──────────────────────────────────────────
create or replace function public.fn_wa_proxima_faixa(p_instancia text, p_de timestamptz default now())
returns table (quando timestamptz, faixa text)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  c     record;
  local timestamp;
  d     int;
begin
  select * into c from public.wa_atendimento_config where instancia = p_instancia;
  if c is null or not c.ativo then return; end if;
  local := p_de at time zone c.fuso;

  -- Oito dias: sete cobrem a semana inteira e o oitavo cobre o caso de a única
  -- faixa da semana ser hoje mais cedo.
  for d in 0..7 loop
    return query
      select ((local::date + d) + h.inicio) at time zone c.fuso, h.faixa
        from public.wa_horarios h
       where h.instancia = p_instancia
         and h.dia = extract(dow from local::date + d)::int
         and ((local::date + d) + h.inicio) > local
         -- O dia marcado como fechado não abre.
         and (c.fechado_em is null or c.fechado_em <> (local::date + d))
       order by h.inicio
       limit 1;
    if found then return; end if;
  end loop;
end $function$;

-- ── 7. o próximo minuto livre da fila daquele número ────────────────────────
create or replace function public.fn_wa_minuto_livre(p_instancia text, p_de timestamptz)
returns timestamptz
language sql
stable
set search_path to 'public'
as $function$
  select greatest(
    date_trunc('minute', p_de),
    coalesce(
      (select max(date_trunc('minute', a.quando)) + interval '1 minute'
         from public.wa_agendadas a
         join public.wa_conversas c on c.id = a.conversa_id
        where c.instancia = p_instancia
          and a.status = 'pendente'
          and a.quando >= p_de - interval '1 hour'),
      date_trunc('minute', p_de))
  );
$function$;

-- ── 8. o texto com as variáveis trocadas ────────────────────────────────────
-- {nome} e {horario}. Sem nome, a saudação some inteira em vez de virar
-- "Olá, !" — que é pior que não cumprimentar.
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
begin
  if t = '' then return t; end if;

  select c.instancia, split_part(btrim(coalesce(c.nome_wa, '')), ' ', 1)
    into v_inst, v_nome
    from public.wa_conversas c where c.id = p_conversa;

  if position('{horario}' in t) > 0 then
    select to_char(x.quando at time zone cfg.fuso, 'HH24:MI') into v_hora
      from public.fn_wa_proxima_faixa(v_inst, p_quando) x
      join public.wa_atendimento_config cfg on cfg.instancia = v_inst
     where x.faixa = 'atendimento'
     limit 1;
    -- Sem próxima faixa de atendimento (grade só com direcionamento, por
    -- exemplo), a frase perde o horário em vez de sair com um buraco.
    t := replace(t, '{horario}', coalesce(v_hora, 'em breve'));
  end if;

  if coalesce(v_nome, '') = '' then
    t := regexp_replace(t, '[,\s]*\{nome\}', '', 'g');
  else
    t := replace(t, '{nome}', v_nome);
  end if;

  return btrim(regexp_replace(t, '[ \t]{2,}', ' ', 'g'));
end $function$;

-- ── 9. pôr uma mensagem de faixa na fila ────────────────────────────────────
create or replace function public.fn_wa_enfileirar_faixa(
  p_conversa uuid, p_faixa text, p_a_partir_de timestamptz
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m       record;
  v_inst  text;
  v_quando timestamptz;
  v_id    uuid;
begin
  select instancia into v_inst from public.wa_conversas where id = p_conversa;
  if v_inst is null then return null; end if;

  select * into m from public.wa_atendimento_msgs
   where instancia = v_inst and faixa = p_faixa;

  -- Faixa sem mensagem quer dizer "não mande nada nessa faixa". É o caso normal
  -- do atendimento real, onde a saudação é opcional.
  if m is null or (coalesce(btrim(m.texto), '') = '' and jsonb_array_length(m.midias) = 0) then
    return null;
  end if;

  v_quando := public.fn_wa_minuto_livre(v_inst, p_a_partir_de);

  insert into public.wa_agendadas
    (conversa_id, quando, tipo, texto, midia_path, midia_mime, midia_nome, duracao, midias, status)
  values
    (p_conversa, v_quando, m.tipo,
     public.fn_wa_texto_variaveis(p_conversa, m.texto, v_quando),
     m.midia_path, m.midia_mime, m.midia_nome, m.duracao, m.midias, 'pendente')
  returning id into v_id;

  return v_id;
end $function$;

-- ── 10. o gatilho: a primeira mensagem do lead ──────────────────────────────
create or replace function public.fn_wa_primeiro_atendimento()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        record;
  v_faixa  text;
  prox     record;
begin
  if new.direcao <> 'entrada' then return new; end if;

  select id, instancia, primeiro_atendimento_em into c
    from public.wa_conversas where id = new.conversa_id
    for update skip locked;
  if c is null or c.primeiro_atendimento_em is not null then return new; end if;

  -- SÓ LEAD NOVO: se já falamos com esta pessoa alguma vez, ela não precisa se
  -- apresentar de novo a um robô.
  if exists (select 1 from public.wa_mensagens m
              where m.conversa_id = new.conversa_id and m.direcao = 'saida') then
    return new;
  end if;

  v_faixa := public.fn_wa_faixa_em(c.instancia, new.criada_em);
  if v_faixa is null then return new; end if;   -- número sem a régua ligada

  update public.wa_conversas set primeiro_atendimento_em = now() where id = c.id;

  if v_faixa = 'fechado' then
    perform public.fn_wa_enfileirar_faixa(c.id, 'fechado', new.criada_em);
    -- E a segunda: na primeira janela que abrir, a mensagem DAQUELA faixa.
    select * into prox from public.fn_wa_proxima_faixa(c.instancia, new.criada_em);
    if prox.quando is not null then
      perform public.fn_wa_enfileirar_faixa(c.id, prox.faixa, prox.quando);
    end if;
  else
    perform public.fn_wa_enfileirar_faixa(c.id, v_faixa, new.criada_em);
  end if;

  return new;
end $function$;

drop trigger if exists trg_wa_primeiro_atendimento on public.wa_mensagens;
create trigger trg_wa_primeiro_atendimento
  after insert on public.wa_mensagens
  for each row execute function public.fn_wa_primeiro_atendimento();

-- ── 11. resposta automática não é atendimento ───────────────────────────────
-- A jornada tratava QUALQUER mensagem nossa como "respondemos" e movia o lead
-- de Na base para Triagem. Um "estamos fechados" que sai sozinho não é alguém
-- ter olhado o caso, e contar como triagem faria a fila mentir logo na etapa
-- que existe para dizer quem ainda não foi atendido.
create or replace function public.fn_wa_mensagem_avanca_jornada()
returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_jornada text;
  v_alvo text;
begin
  select jornada into v_jornada from public.wa_conversas where id = new.conversa_id;
  if v_jornada is distinct from 'bradesco' then return new; end if;

  if new.direcao = 'saida' then
    if coalesce(new.automatica, false) then return new; end if;
    v_alvo := case when new.tipo = 'texto' and coalesce(new.texto, '') ~* 'extrato'
                   then 'aguardando_extrato' else 'triagem' end;
  elsif new.direcao = 'entrada' and new.tipo = 'documento' and coalesce(new.midia_mime, '') ~* 'pdf' then
    v_alvo := 'aguardando_analise';
  end if;

  if v_alvo is not null then perform public.fn_wa_avancar_bradesco(new.conversa_id, v_alvo); end if;
  return new;
end $function$;
