-- AS TASKS DO ATENDIMENTO VIRAM COISA DE VERDADE.
--
-- Até aqui elas viviam em estado de componente: sumiam ao recarregar a página.
-- Servia pra discutir o formato, não pra trabalhar — e a partir de agora é
-- trabalho: a Adria marca "ligar pra dona Maria amanhã às 15h" e isso precisa
-- estar lá amanhã, na máquina dela e na de quem mais abrir a tela.
--
-- SÓ LEMBRETE MORA AQUI. Follow-up não é gravado de propósito: ele é CALCULADO
-- do tempo que o lead está parado (src/lib/tasksAtendimento.ts, a cadência de
-- 2/5/10/20/30 dias). Guardar follow-up no banco criaria duas verdades sobre o
-- mesmo lead — a linha gravada ontem e a conta feita hoje — e elas divergiriam
-- no primeiro dia em que alguém mexesse na conversa.
--
-- A HORA É SEPARADA DO DIA, e não um timestamp só. A fila é do DIA: a tela
-- pergunta "o que tem pra hoje", e um timestamp obrigaria toda consulta a virar
-- faixa entre meia-noite e meia-noite no fuso certo — o tipo de conta que erra
-- em silêncio no horário de verão e na virada do mês. Com `date` + `time`
-- opcional, "quinta-feira" é literalmente quinta-feira, e a hora é o que ela
-- deveria ser: um detalhe do lembrete, que às vezes não existe ("passar o
-- extrato hoje" não tem hora).

create table if not exists public.wa_tasks (
  id           uuid primary key default gen_random_uuid(),
  conversa_id  uuid not null references public.wa_conversas(id) on delete cascade,
  titulo       text not null,
  detalhe      text,
  dia          date not null,
  hora         time,
  feita        boolean not null default false,
  feita_em     timestamptz,
  feita_por    uuid references auth.users(id) on delete set null,
  criado_por   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint wa_tasks_titulo_nao_vazio check (length(btrim(titulo)) > 0)
);

-- A pergunta que a tela faz o tempo todo é "o que tem no dia X"; e a segunda é
-- "o que tem desse lead" (a coluna de detalhe mostra as tasks da conversa
-- aberta).
create index if not exists wa_tasks_dia_idx on public.wa_tasks (dia);
create index if not exists wa_tasks_conversa_idx on public.wa_tasks (conversa_id, dia);

alter table public.wa_tasks enable row level security;

-- Admin OU quem tem o módulo. A política antiga das outras tabelas do WhatsApp
-- só olhava o módulo, e o resultado foi a tela abrir e não vir linha nenhuma
-- pra quem é admin sem o módulo — RLS não sabe o que é admin a menos que
-- alguém diga.
drop policy if exists wa_tasks_modulo on public.wa_tasks;
create policy wa_tasks_modulo on public.wa_tasks
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));

drop trigger if exists trg_wa_tasks_updated on public.wa_tasks;
create trigger trg_wa_tasks_updated before update on public.wa_tasks
  for each row execute function public.fn_touch_updated_at();

comment on table public.wa_tasks is
  'Lembretes do atendimento, marcados à mão. Follow-up NÃO mora aqui: é calculado da cadência de dias parados.';
comment on column public.wa_tasks.hora is
  'Opcional. "Passar o extrato hoje" não tem hora; "ligar às 15h" tem.';
