-- PREVISIBILIDADES: o dinheiro que a gente já sabe que vem e que vai.
--
-- Cliente que paga todo mês, parcela que o escritório assumiu. É a mesma
-- mecânica do custo fixo — repete todo mês, tem dia, vira "a vencer", ganha
-- baixa quando acontece — então mora na MESMA tabela, com uma etiqueta que diz
-- de que série é. Tabela separada duplicaria materialização, status, baixa e o
-- formulário inteiro, e no primeiro mês as duas já divergiriam.
--
-- O que muda entre as duas séries é o sentido da pergunta:
--   fixo            → "quanto o escritório gasta todo mês, aconteça o que
--                      acontecer". Estrutura. Não tem fim previsto.
--   previsibilidade → "o que já está contratado pra entrar e pra sair".
--                      Cliente mensal acaba quando o contrato acaba; parcela
--                      acaba quando quita. Por isso `fim` importa aqui.
--
-- ESTIMADO É A PARTE HONESTA. O escritório pediu pra lançar "de maneira brusca"
-- e marcar com asterisco o que ainda não é exato. `estimado` é esse asterisco:
-- o número está lá pra dar noção de ordem de grandeza, e a tela avisa que ele
-- não foi conferido. Sem isso, um chute vira verdade em duas semanas só porque
-- estava escrito na tela.

alter table public.balance_recorrentes
  add column if not exists serie       text not null default 'fixo',
  add column if not exists estimado    boolean not null default false,
  add column if not exists cliente_id  uuid references public.clientes(id) on delete set null,
  add column if not exists observacoes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'balance_recorrentes_serie_ck') then
    alter table public.balance_recorrentes
      add constraint balance_recorrentes_serie_ck
      check (serie in ('fixo','previsibilidade'));
  end if;
end $$;

comment on column public.balance_recorrentes.serie is
  'fixo = estrutura do escritório, sem fim previsto. previsibilidade = o que está contratado pra entrar ou sair e tem fim (cliente mensal, parcela).';
comment on column public.balance_recorrentes.estimado is
  'true = o valor é ordem de grandeza, não número conferido. A tela marca com asterisco.';

-- o lançamento gerado herda o cliente da série, quando houver
create or replace function public.fn_balance_materializar_recorrentes(
  p_mes date default date_trunc('month', current_date)::date
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r         record;
  v_venc    date;
  v_ref     text;
  v_comp    text;
  v_ini     date := date_trunc('month', p_mes)::date;
  v_fim     date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_criados int := 0;
  v_ultimo  int := extract(day from v_fim);
begin
  for r in
    select * from public.balance_recorrentes
     where ativo and inicio <= v_fim and (fim is null or fim >= v_ini)
  loop
    if exists (
      select 1 from public.balance_lancamentos
       where recorrente_id = r.id and data between v_ini and v_fim
    ) then
      continue;
    end if;

    v_venc := (v_ini + make_interval(days => least(r.dia_vencimento, v_ultimo) - 1))::date;
    v_ref  := r.id::text || '|' || to_char(p_mes, 'YYYY-MM');
    v_comp := case when coalesce(r.competencia_offset, 0) = 0 then null
                   else to_char(v_ini + make_interval(months => r.competencia_offset), 'YYYY-MM')
              end;

    begin
      insert into public.balance_lancamentos
        (conta_id, categoria_id, tipo, valor, data, status, descricao,
         origem, origem_ref, recorrente_id, competencia, cliente_id, observacoes)
      values
        (r.conta_id, r.categoria_id, r.tipo, r.valor, v_venc, 'previsto', r.descricao,
         'recorrente', v_ref, r.id, v_comp, r.cliente_id,
         case when r.estimado then 'Valor estimado — conferir antes de dar baixa.' else null end);
      v_criados := v_criados + 1;
    exception when unique_violation then
      null;
    end;
  end loop;

  return jsonb_build_object('mes', to_char(p_mes,'YYYY-MM'), 'criados', v_criados);
end;
$function$;

grant execute on function public.fn_balance_materializar_recorrentes(date) to authenticated;

-- ── os cinco de sempre continuam sendo fixos ────────────────────────────────
update public.balance_recorrentes set serie = 'fixo' where serie is null or serie = 'fixo';

-- ── clientes mensais ────────────────────────────────────────────────────────
-- Vieram do chamado "CONTROLE FINANCEIRO DE CLIENTES MENSAIS" que o Dr. Matheus
-- abriu em 28/08. FAUSTO e KELVIN têm cadastro único e ficam amarrados ao
-- cliente; MÁRCIA e MARCOS têm homônimos na base (duas Márcias, três Marcos) e
-- ficam sem amarração — apontar pro cliente errado é pior que não apontar.
insert into public.balance_recorrentes
  (descricao, conta_id, categoria_id, tipo, valor, dia_vencimento, inicio, ativo,
   serie, estimado, cliente_id, observacoes)
select v.descricao,
       (select id from public.balance_contas where banco = 'caixa' limit 1),
       (select id from public.balance_categorias where nome = 'Honorário contratual' and tipo = 'entrada'),
       'entrada', v.valor, v.dia, date '2026-09-01', true,
       'previsibilidade', true, v.cliente::uuid, v.obs
  from (values
    ('Mensalidade · Fausto',  580.00, 20, 'bb173ebb-b560-4630-b6fa-bb09d14f439a', 'Do chamado de 28/08. Sem data de fim registrada.'),
    ('Mensalidade · Márcia',  500.00,  6, null,                                   'Do chamado de 28/08. Duas Márcias na base — confirmar qual antes de amarrar.'),
    ('Mensalidade · Kelvin',  600.00, 30, '73bb7c77-3c65-4d51-ba7d-31365ea37f94', 'Do chamado de 28/08. Sem data de fim registrada.'),
    ('Mensalidade · Marcos',  500.00, 15, null,                                   'Do chamado de 28/08. Três Marcos na base — confirmar qual antes de amarrar.')
  ) as v(descricao, valor, dia, cliente, obs)
 where not exists (
   select 1 from public.balance_recorrentes r where r.descricao = v.descricao
 );

-- ── parcela da cadeira ──────────────────────────────────────────────────────
-- O único registro é a saída de R$ 195,03 em 28/08, dentro do pix do Dr. Diego.
-- Quantas parcelas faltam, ninguém disse — e eu não invento prazo de dívida.
-- Fica sem `fim`, marcada como estimada, esperando o número certo.
insert into public.balance_recorrentes
  (descricao, conta_id, categoria_id, tipo, valor, dia_vencimento, inicio, ativo,
   serie, estimado, observacoes)
select 'Parcela das cadeiras',
       (select id from public.balance_contas where banco = 'caixa' limit 1),
       (select id from public.balance_categorias where nome = 'Material e manutenção' and tipo = 'saida'),
       'saida', 195.03, 28, date '2026-09-01', true,
       'previsibilidade', true,
       'Valor tirado da saída de 28/08. Quantas parcelas faltam não está em lugar nenhum — preencher o fim quando souberem.'
 where not exists (
   select 1 from public.balance_recorrentes r where r.descricao = 'Parcela das cadeiras'
 );
