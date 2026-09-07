-- A RÉGUA DEIXA DE SER CONSTANTE E VIRA DADO.
--
-- Os degraus 1, 5, 15, 30 e 60 estavam escritos em dois lugares — num `const` do
-- navegador e dentro de `fn_wa_cadencia()` — e nenhum dos dois se move sem
-- deploy. Só que quem decide de quantos em quantos dias cobrar é o escritório, e
-- essa decisão muda com a estação: no mês cheio de audiência, cobrar de 1 dia é
-- perseguição; na semana morta, esperar 15 é perder o lead.
--
-- UMA TABELA, NÃO CINCO COLUNAS numa linha de configuração: a régua tem rodadas,
-- e rodada é linha. Com linha dá pra saber quem mudou o degrau e quando — e essa
-- é exatamente a pergunta que aparece quando a fila do dia amanhece diferente do
-- que estava ontem.
--
-- O BANCO CONTINUA MANDANDO. `fn_wa_cadencia()` passa a ler daqui, então a
-- sincronização das tasks e o agendamento da próxima rodada mudam junto com a
-- tela. Se a tabela estiver vazia por qualquer motivo, a régua antiga volta a
-- valer — a fila do dia não pode sumir por causa de um delete.
create table if not exists public.wa_followup_cadencia (
  rodada         int primary key check (rodada between 1 and 5),

  -- Dias de silêncio em que esta rodada vence. O teto de um ano é o que separa
  -- "esperar bastante" de erro de digitação: 600 em vez de 60 não seria notado
  -- até a rodada não vencer nunca.
  dias           int not null check (dias between 1 and 365),

  atualizado_por uuid references auth.users(id),
  updated_at     timestamptz not null default now()
);

comment on table public.wa_followup_cadencia is
  'Os degraus da regua de follow-up, em dias de silencio. Uma linha por rodada; fn_wa_cadencia le daqui.';

-- Os degraus que já valiam. `on conflict do nothing` porque esta migração pode
-- rodar de novo, e reaplicar o padrão apagaria uma régua já ajustada.
insert into public.wa_followup_cadencia (rodada, dias)
values (1, 1), (2, 5), (3, 15), (4, 30), (5, 60)
on conflict (rodada) do nothing;

/* A RÉGUA PRECISA SUBIR. Um degrau menor que o anterior não é uma régua
   ousada, é uma régua quebrada: `vencimentoDaProxima` calcula o intervalo pela
   diferença entre dois degraus, e diferença negativa agendaria a próxima
   cobrança para ANTES da que acabou de ser feita — a fila do dia encheria de
   coisa vencida que ninguém marcou.

   A checagem é de LINHA e olha a tabela inteira porque a ordem é uma relação
   entre linhas; um `check` de coluna não enxerga a vizinha. */
create or replace function public.fn_wa_cadencia_valida()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  fora int;
begin
  select count(*) into fora
    from (
      select dias, lag(dias) over (order by rodada) as anterior
        from public.wa_followup_cadencia
    ) t
   where t.anterior is not null and t.dias <= t.anterior;

  if fora > 0 then
    raise exception 'A régua precisa subir: cada rodada tem que esperar mais dias que a anterior.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_wa_followup_cadencia_ordem on public.wa_followup_cadencia;
create constraint trigger trg_wa_followup_cadencia_ordem
  after insert or update on public.wa_followup_cadencia
  deferrable initially deferred
  for each row execute function public.fn_wa_cadencia_valida();

drop trigger if exists trg_wa_followup_cadencia_updated on public.wa_followup_cadencia;
create trigger trg_wa_followup_cadencia_updated
  before update on public.wa_followup_cadencia
  for each row execute function public.set_updated_at();

alter table public.wa_followup_cadencia enable row level security;

drop policy if exists "wa_followup_cadencia_ler" on public.wa_followup_cadencia;
create policy "wa_followup_cadencia_ler" on public.wa_followup_cadencia
  for select to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'));

drop policy if exists "wa_followup_cadencia_escrever" on public.wa_followup_cadencia;
create policy "wa_followup_cadencia_escrever" on public.wa_followup_cadencia
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));

/* Deixa de ser IMMUTABLE: ela lê tabela agora. Marcar como imutável uma função
   que consulta dados é o tipo de mentira que o planejador acredita — ele
   guardaria o resultado da primeira chamada e a régua nova só valeria depois de
   reiniciar a conexão. */
create or replace function public.fn_wa_cadencia()
returns integer[]
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    (select array_agg(dias order by rodada) from public.wa_followup_cadencia),
    array[1, 5, 15, 30, 60]);
$$;
