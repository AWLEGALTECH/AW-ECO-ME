-- A RETENÇÃO DE MENSAGEM: a mensagem fica presa até a hora marcada, e então sai
-- sozinha para o cliente.
--
-- Isso é diferente de tudo que o módulo fazia até agora. Toda mensagem que saiu
-- daqui até hoje saiu porque alguém apertou enviar, olhando a conversa. Esta
-- sai sem ninguém na frente da tela — de madrugada, no domingo, com o
-- escritório fechado. O que muda de fundo é o custo do erro: um texto no lead
-- errado, com o remetente do escritório, e sem ninguém para perceber na hora.
--
-- POR ISSO O DESENHO INTEIRO É SOBRE DISPARAR UMA VEZ SÓ:
--
-- 1. O ESTADO `enviando` EXISTE, e não é firula. Sem ele, dois despachos
--    concorrentes (o cron atrasou e o seguinte entrou junto) leem as mesmas
--    linhas "pendentes" e mandam a mesma mensagem duas vezes. A tomada é um
--    UPDATE atômico: quem conseguir mudar de `pendente` para `enviando` é o
--    dono daquela linha, e o outro não acha mais nada. `for update skip locked`
--    resolveria a corrida dentro de uma transação; isto resolve inclusive entre
--    duas execuções separadas da função.
--
-- 2. FALHA NÃO VOLTA PARA `pendente` PARA SEMPRE. Três tentativas e a linha
--    morre em `falhou`, com o erro escrito. Uma mensagem que a Evolution recusa
--    por um motivo permanente (número inválido, instância desconectada) tentaria
--    a cada minuto até alguém notar — e "alguém notar" é justamente o que não
--    existe às três da manhã.
--
-- 3. CANCELAR É UM ESTADO, NÃO UM DELETE. "Sumiu da lista" é indistinguível de
--    "foi enviada e não apareceu", e essa dúvida, aqui, faz alguém mandar de
--    novo à mão.
--
-- 4. A LINHA GUARDA O TEXTO INTEIRO, e não uma referência ao lembrete. O
--    lembrete pode ser concluído, apagado ou reescrito antes da hora; a
--    mensagem que vai pro cliente não pode mudar depois de agendada sem que
--    alguém tenha decidido isso.

create table if not exists public.wa_agendadas (
  id           uuid primary key default gen_random_uuid(),
  conversa_id  uuid not null references public.wa_conversas(id) on delete cascade,
  -- O lembrete que originou. `set null` porque a mensagem é independente dele:
  -- concluir o lembrete não pode cancelar um envio que já foi decidido.
  task_id      uuid references public.wa_tasks(id) on delete set null,

  quando       timestamptz not null,

  tipo         text not null default 'texto'
               check (tipo in ('texto','imagem','video','documento','audio')),
  texto        text,
  midia_path   text,
  midia_mime   text,
  midia_nome   text,
  duracao      int,

  status       text not null default 'pendente'
               check (status in ('pendente','enviando','enviada','cancelada','falhou')),
  tentativas   int  not null default 0,
  erro         text,
  enviada_em   timestamptz,
  mensagem_id  uuid references public.wa_mensagens(id) on delete set null,

  criada_por   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Texto sem texto e mídia sem arquivo são as duas formas de agendar o nada.
  constraint wa_agendadas_tem_conteudo check (
    (tipo = 'texto' and coalesce(btrim(texto), '') <> '')
    or (tipo <> 'texto' and midia_path is not null)
  )
);

comment on table public.wa_agendadas is
  'Mensagens retidas: saem sozinhas na hora marcada. O estado enviando e a trava que impede disparo duplo.';

-- O índice serve à pergunta que o despachante faz a cada minuto: o que já
-- venceu e ainda não saiu. Parcial porque enviada/cancelada/falhou nunca mais
-- interessam a essa busca, e são a maioria das linhas com o tempo.
create index if not exists wa_agendadas_a_vencer
  on public.wa_agendadas (quando)
  where status = 'pendente';

create index if not exists wa_agendadas_por_conversa
  on public.wa_agendadas (conversa_id, quando desc);

drop trigger if exists trg_wa_agendadas_updated on public.wa_agendadas;
create trigger trg_wa_agendadas_updated
  before update on public.wa_agendadas
  for each row execute function public.set_updated_at();

alter table public.wa_agendadas enable row level security;

-- Mesma porta das outras tabelas do módulo: quem tem o atendimento, ou admin.
drop policy if exists "wa_agendadas_ler" on public.wa_agendadas;
create policy "wa_agendadas_ler" on public.wa_agendadas
  for select to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'));

drop policy if exists "wa_agendadas_escrever" on public.wa_agendadas;
create policy "wa_agendadas_escrever" on public.wa_agendadas
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));

/**
 * A TOMADA. Marca como `enviando` tudo que venceu e devolve o que tomou.
 *
 * É um UPDATE que filtra por `status = 'pendente'`: o Postgres garante que só
 * uma execução consegue mudar cada linha, e a outra simplesmente não a vê no
 * retorno. Sem isso, dois despachos sobrepostos mandariam a mesma mensagem duas
 * vezes — e mensagem repetida para cliente é pior que mensagem atrasada.
 *
 * O limite existe para o caso de uma fila represada: cem mensagens vencidas de
 * uma vez estourariam o tempo da função e nenhuma sairia. Vinte por rodada, e o
 * minuto seguinte pega o resto.
 */
create or replace function public.fn_wa_agendadas_tomar(p_limite int default 20)
returns setof public.wa_agendadas
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  update public.wa_agendadas a
     set status = 'enviando', tentativas = a.tentativas + 1, updated_at = now()
   where a.id in (
     select b.id from public.wa_agendadas b
      where b.status = 'pendente' and b.quando <= now()
      order by b.quando
      limit p_limite
   )
  returning a.*;
end $$;

/**
 * O desfecho de uma tentativa.
 *
 * Sucesso encerra. Falha volta para `pendente` (o minuto seguinte tenta de
 * novo) até a terceira, quando vira `falhou` de vez: erro permanente tentado a
 * cada minuto é ruído que esconde os problemas de verdade, e ninguém está
 * olhando de madrugada para interromper.
 */
create or replace function public.fn_wa_agendada_desfecho(
  p_id       uuid,
  p_ok       boolean,
  p_mensagem uuid default null,
  p_erro     text default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_status text;
begin
  if p_ok then
    update public.wa_agendadas
       set status = 'enviada', enviada_em = now(), mensagem_id = p_mensagem, erro = null
     where id = p_id
    returning status into v_status;
  else
    update public.wa_agendadas
       set status = case when tentativas >= 3 then 'falhou' else 'pendente' end,
           erro = p_erro
     where id = p_id
    returning status into v_status;
  end if;
  return v_status;
end $$;

-- ── QUEM PUXA O GATILHO ──
--
-- O pg_cron chama a wa-despachar a cada minuto. Um minuto é a resolução do
-- sistema: quem agenda para 14:00 vê sair entre 14:00 e 14:01, e prometer
-- mais exatidão que isso seria mentira de qualquer forma (a Evolution e o
-- WhatsApp somam os segundos deles depois).
--
-- A chave no header é a ANON, e não a de serviço, por dois motivos: é o padrão
-- que os outros crons deste banco já usam, e chamar esta função fora de hora
-- não antecipa nada — a fila é filtrada por `quando <= now()`, então uma
-- chamada extra encontra a mesma lista vazia que encontraria sozinha.
select cron.unschedule('wa-despachar-minuto') where exists (
  select 1 from cron.job where jobname = 'wa-despachar-minuto'
);

select cron.schedule(
  'wa-despachar-minuto',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://wvltdjspytysuoybcfgb.supabase.co/functions/v1/wa-despachar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <anon key do projeto>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
  $cron$
);

-- ── SÓ O DESPACHANTE MEXE NA FILA ──
--
-- As duas funções nascem SECURITY DEFINER e, por padrão no Postgres, com
-- EXECUTE para public — o que inclui o papel `anon`, cuja chave é pública e vai
-- dentro do site. O estrago não seria vazamento, seria pior: chamar
-- `fn_wa_agendadas_tomar` de fora marca as mensagens como `enviando` sem
-- enviá-las, e elas ficam presas nesse estado para sempre, sem nunca chegar ao
-- cliente e sem ninguém entender por quê. `fn_wa_agendada_desfecho` deixaria
-- marcar qualquer agendamento como enviado, com o mesmo efeito.
--
-- Quem precisa delas é a edge function, que fala com o banco como service_role.
-- Ninguém mais.
revoke execute on function public.fn_wa_agendadas_tomar(int)  from public, anon, authenticated;
revoke execute on function public.fn_wa_agendada_desfecho(uuid, boolean, uuid, text) from public, anon, authenticated;

grant execute on function public.fn_wa_agendadas_tomar(int)  to service_role;
grant execute on function public.fn_wa_agendada_desfecho(uuid, boolean, uuid, text) to service_role;
