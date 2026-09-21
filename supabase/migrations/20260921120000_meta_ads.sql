-- META ADS DENTRO DO AW: os números das campanhas, registrados dia a dia.
--
-- Pedido do chefe (21/09): "dados das campanhas, para os números sempre
-- estarem na ponta da língua e bem registrados". A segunda metade da frase é
-- a que define o desenho. "Na ponta da língua" bastaria com uma consulta ao
-- vivo à Meta a cada abertura de tela; "bem registrados" pede HISTÓRICO, e a
-- Meta só guarda o dela com a resolução dela, do jeito dela. Então o dado
-- desce para cá uma vez por hora e fica.
--
-- E há um motivo que apareceu já no primeiro olhar: a única campanha ativa
-- da conta (Bradesco, leads) parou de gastar em 16/09 e o Gerenciador
-- continuava dizendo "Ativa". Sem uma cópia diária aqui, isso só se descobre
-- entrando na Meta e olhando um gráfico. Com ela, vira um aviso na tela.
--
-- DUAS TABELAS, e não uma. O status da campanha é de AGORA (ativa, pausada),
-- e o gasto é de CADA DIA. Juntar os dois numa linha por dia repetiria o
-- status trinta vezes e deixaria a pergunta "está ativa?" dependendo de qual
-- linha se lê.

create table if not exists public.meta_campanhas (
  id               text primary key,             -- id da campanha na Meta
  conta_id         text not null,                -- act_… sem o prefixo
  nome             text not null,
  status           text not null,                -- ACTIVE | PAUSED | ARCHIVED | …
  objetivo         text,                         -- OUTCOME_LEADS | OUTCOME_TRAFFIC | …
  orcamento_diario numeric(12,2),                -- em reais; null quando o orçamento é do conjunto
  criada_na_meta   timestamptz,
  atualizado_em    timestamptz not null default now()
);

comment on table public.meta_campanhas is
  'Catalogo das campanhas da conta de anuncios, como a Meta as ve AGORA. Atualizado pela meta-sync.';

create table if not exists public.meta_campanhas_diario (
  campanha_id  text not null references public.meta_campanhas(id) on delete cascade,
  dia          date not null,
  gasto        numeric(12,2) not null default 0,
  impressoes   integer not null default 0,
  alcance      integer not null default 0,
  cliques      integer not null default 0,
  -- O resultado conforme o OBJETIVO da campanha (lead, conversa, clique).
  -- Calculado na descida a partir de `acoes`, pela regra de src/lib/metaAds.ts.
  resultados   integer not null default 0,
  -- A lista bruta de acoes da Meta. Fica porque a regra de "o que e resultado"
  -- pode mudar, e sem o bruto nao ha como recalcular o passado.
  acoes        jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (campanha_id, dia)
);

create index if not exists idx_meta_diario_dia on public.meta_campanhas_diario (dia desc);

comment on table public.meta_campanhas_diario is
  'Uma linha por campanha por dia. Os ultimos 3 dias sao regravados a cada sincronizacao, porque a Meta ajusta atribuicao por ate 72h.';

-- ── quem lê ────────────────────────────────────────────────────────────────
-- Leitura para a casa inteira: número de campanha não é segredo de ninguém
-- aqui dentro, e a tela de Marketing é de todo mundo. Escrita só pela função,
-- com a chave de serviço, que passa por cima da RLS.
alter table public.meta_campanhas enable row level security;
alter table public.meta_campanhas_diario enable row level security;

drop policy if exists meta_campanhas_select on public.meta_campanhas;
create policy meta_campanhas_select on public.meta_campanhas
  for select to authenticated using (true);

drop policy if exists meta_diario_select on public.meta_campanhas_diario;
create policy meta_diario_select on public.meta_campanhas_diario
  for select to authenticated using (true);

-- ── o registro de cada descida ─────────────────────────────────────────────
-- Uma linha por rodada, com o que aconteceu. É o que responde "os números
-- estão atualizados?" sem ninguém precisar comparar com o Gerenciador, e é
-- onde o token expirado aparece antes de alguém achar que a campanha morreu.
create table if not exists public.meta_sync_log (
  id          uuid primary key default gen_random_uuid(),
  rodada_em   timestamptz not null default now(),
  ok          boolean not null,
  campanhas   integer,
  dias        integer,
  erro        text,
  duracao_ms  integer
);

alter table public.meta_sync_log enable row level security;
drop policy if exists meta_sync_log_select on public.meta_sync_log;
create policy meta_sync_log_select on public.meta_sync_log
  for select to authenticated using (true);

-- ── o relógio ──────────────────────────────────────────────────────────────
-- DE HORA EM HORA. A Meta atualiza os insights com atraso de minutos a
-- algumas horas, então de minuto em minuto seria pedir o mesmo número
-- sessenta vezes. E a conta tem um teto de chamadas por hora que uma varredura
-- de trinta dias já consome parte.
-- A chave no cabeçalho é a anon, como nos outros crons deste banco: chamar a
-- função fora de hora não muda nada, ela só repete a descida.
select cron.unschedule('meta-sync-hora') where exists (
  select 1 from cron.job where jobname = 'meta-sync-hora'
);

select cron.schedule(
  'meta-sync-hora',
  '7 * * * *',
  $cron$
  select net.http_post(
    url := 'https://wvltdjspytysuoybcfgb.supabase.co/functions/v1/meta-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <anon key do projeto>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
