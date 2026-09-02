-- A REGRA DO 5º DIA ÚTIL COMEÇA NA VIRADA AGOSTO→SETEMBRO/2026.
--
-- A primeira versão aplicava a regra à base inteira e mexia em maio, junho e
-- julho — meses já fechados, já contados e já pagos. Mês fechado não muda de
-- número: a régua nova vale daqui pra frente, e o passado fica como está.
--
-- 2026-09-01 é a primeira data que pode escorregar pro mês anterior. Os
-- primeiros dias de agosto continuam em agosto.
--
-- Efeito: só os 4 fechamentos de setembro mudam, e vão pra agosto.
--
--     maio      42 rubricas  (intacto)
--     junho     43           (intacto)
--     julho    147           (intacto)
--     agosto   111 → 117     (recebe os de setembro)
--     setembro   6 → 0
--
-- Agosto sobe de 111 pra 117 e segue acima da meta de 100 do mês — a preocupação
-- que a versão anterior tinha criado (agosto caía pra 91) some junto.

create or replace function public.fn_competencia_fechamento(d date)
returns text language sql immutable as $$
  select to_char(
    case when d >= date '2026-09-01' and d <= public.fn_quinto_dia_util(d)
         then (date_trunc('month', d) - interval '1 month')
         else date_trunc('month', d)
    end, 'YYYY-MM');
$$;

-- Coluna gerada é calculada UMA vez e gravada: mudar a função não reescreve o
-- que já está lá. Derrubar e recriar é o jeito de forçar o recálculo — e não há
-- perda de dado, porque ela sempre sai da data.
alter table public.fechamentos drop column if exists competencia;

alter table public.fechamentos
  add column competencia text
  generated always as (public.fn_competencia_fechamento(data)) stored;

create index if not exists fechamentos_competencia_idx on public.fechamentos (competencia);

comment on column public.fechamentos.competencia is
  'Mês a que o fechamento pertence (YYYY-MM). Da virada agosto→setembro/2026 em diante, tudo até o 5º dia útil conta no mês anterior; antes disso, é o mês da própria data. Coluna gerada — não dá pra editar à mão.';
