-- O LANÇAMENTO PASSA A TER HISTÓRICO — E A SER EDITÁVEL SEM PERDER O RASTRO.
--
-- Até agora dava pra excluir um lançamento e criar outro no lugar, o que é a
-- pior forma de corrigir: some quem lançou, some quando, e some o que mudou.
-- Com o histórico, editar deixa de ser perigoso — cada correção fica registrada
-- com nome e data.
--
-- Não inventei tabela nova. O `audit_trigger()` já existe desde maio e já é o
-- que registra clientes, processos, demandas e perfis, com o mesmo formato de
-- diff (chave → antes/depois). Este arquivo só o pendura em
-- `balance_lancamentos` e escreve o leitor.

-- ── 1. o rastro ─────────────────────────────────────────────────────────────
drop trigger if exists trg_audit_balance_lancamentos on public.balance_lancamentos;
create trigger trg_audit_balance_lancamentos
  after insert or update or delete on public.balance_lancamentos
  for each row execute function public.audit_trigger();

-- ── 2. a trava do repasse ───────────────────────────────────────────────────
-- Editar o valor de uma entrada que carrega dinheiro de cliente é onde isso
-- pode virar prejuízo: baixar o valor abaixo do que se deve ao cliente faria a
-- conta ficar negativa pro escritório sem ninguém ver. A tela avisa, mas a tela
-- não pode ser a única guarda — quem edita pelo banco também passa por aqui.
create or replace function public.fn_balance_valor_cabe_no_repasse()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_devido numeric;
  v_txt    text;
begin
  select coalesce(sum(valor_devido), 0) into v_devido
    from public.balance_repasses
   where lancamento_entrada_id = new.id;

  if v_devido > 0 and new.valor < v_devido then
    -- G e D no to_char seguem a locale do servidor, que aqui é americana: a
    -- mensagem saía "2,037.79" pra quem lê "2.037,79". Formata com separadores
    -- literais e troca os dois de lugar.
    v_txt := to_char(v_devido, 'FM999,999,999.00');
    v_txt := replace(replace(replace(v_txt, ',', '·'), '.', ','), '·', '.');
    raise exception
      'este lançamento tem R$ % de repasse ao cliente; o valor não pode ficar abaixo disso',
      v_txt;
  end if;
  return new;
end $$;

drop trigger if exists trg_balance_valor_cabe_no_repasse on public.balance_lancamentos;
create trigger trg_balance_valor_cabe_no_repasse
  before update of valor on public.balance_lancamentos
  for each row execute function public.fn_balance_valor_cabe_no_repasse();

-- ── 3. o leitor ─────────────────────────────────────────────────────────────
-- Por que RPC e não select direto: a política do audit_log só deixa admin ler
-- (fora as linhas do próprio usuário e três tabelas do fluxo comercial). Abrir
-- a tabela inteira pra quem tem o Wallet seria dar acesso ao log de todo o
-- sistema; esta função entrega só as linhas de UM lançamento, e ainda cobra o
-- mesmo módulo que a tela cobra.
--
-- OS LANÇAMENTOS ANTIGOS NÃO FICAM SEM AUTOR. Os 46 que já existem nasceram
-- antes do trigger, então não têm linha de criação no log — mas a própria
-- tabela guarda `criado_por` e `created_at`. Quando falta o registro de
-- criação, a função sintetiza um a partir daí, e o histórico começa contando
-- quem lançou em vez de começar do nada.
create or replace function public.fn_balance_historico_lancamento(p_lancamento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v jsonb;
begin
  if not public.tem_modulo('balance') then
    raise exception 'sem acesso ao Wallet';
  end if;

  with logs as (
    select a.created_at, a.action, a.user_id, a.user_email, a.diff
      from public.audit_log a
     where a.resource_type = 'balance_lancamentos'
       and a.resource_id   = p_lancamento_id::text
  ),
  sintetico as (
    select l.created_at, 'create'::text, l.criado_por, null::text, null::jsonb
      from public.balance_lancamentos l
     where l.id = p_lancamento_id
       and not exists (select 1 from logs where logs.action = 'create')
  ),
  tudo as (
    select * from logs
    union all
    select * from sintetico
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'quando',   t.created_at,
             'acao',     t.action,
             'quem',     coalesce(nullif(trim(pr.nome), ''), t.user_email, 'sistema'),
             'mudancas', t.diff)
           order by t.created_at), '[]'::jsonb)
    into v
    from tudo t
    left join public.profiles pr on pr.id = t.user_id;

  return v;
end $$;

grant execute on function public.fn_balance_historico_lancamento(uuid) to authenticated;

comment on function public.fn_balance_historico_lancamento(uuid) is
  'Histórico de um lançamento do Wallet: quem criou, quem editou e o que mudou. '
  'Sintetiza a criação a partir de criado_por quando o lançamento é anterior ao trigger.';
