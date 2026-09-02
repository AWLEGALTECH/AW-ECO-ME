-- O MÊS DO FECHAMENTO VAI ATÉ O 5º DIA ÚTIL DO SEGUINTE.
--
-- Regra do escritório: tudo que fecha até o 5º dia útil conta no mês anterior.
-- Faz sentido com o jeito que o time trabalha — a corrida do fim do mês
-- transborda pros primeiros dias, e contar esses fechamentos no mês novo
-- premiava o mês errado duas vezes: inflava o novo e afundava o que deu o
-- trabalho.
--
-- DIA ÚTIL AQUI EXCLUI FERIADO, e isso não é preciosismo: em setembro/2026 o
-- 5º dia útil seria 07/09 contando só dias de semana, mas o 5 (elevação do
-- Amazonas a província) e o 7 (Independência) são feriados — o quinto dia útil
-- de verdade é 08/09. Um dia de diferença muda de mês tudo que fechar naquele
-- dia.
--
-- COLUNA GERADA, NÃO CAMPO EDITÁVEL. `competencia` é calculada pelo banco a
-- partir da data e não pode ser escrita à mão. Três consequências boas:
-- a régua vive num lugar só (a tela nunca discorda de um relatório em SQL),
-- mudar a data recalcula sozinho, e ninguém "conserta" um mês editando a
-- coluna. O preço é que ela não tem exceção: um fechamento genuinamente novo
-- feito no dia 2 também cai no mês anterior. Se um dia precisar de exceção,
-- vira coluna comum com trigger — e aí passa a poder divergir da regra.
--
-- Ela também não recalcula sozinha se a lista de feriados mudar: valor gerado
-- é gravado uma vez. Mexeu em `fn_feriado`? Tem que reescrever a coluna
-- (um `update fechamentos set data = data` resolve).

-- Páscoa pelo algoritmo de Meeus/Jones/Butcher: é dela que saem carnaval,
-- sexta-feira santa e corpus christi.
create or replace function public.fn_pascoa(p_ano int)
returns date language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int;
        i int; k int; l int; m int; mes int; dia int;
begin
  a := p_ano % 19;
  b := p_ano / 100;
  c := p_ano % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31;
  dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_ano, mes, dia);
end $$;

-- Nacionais + o estadual do AM (05/09) e o municipal de Manaus (08/12).
-- Está tudo em código porque coluna gerada exige função IMMUTABLE, e função
-- imutável não pode ler tabela. Feriado novo = alterar aqui e reescrever a
-- coluna.
create or replace function public.fn_feriado(d date)
returns boolean language plpgsql immutable as $$
declare p date := public.fn_pascoa(extract(year from d)::int);
begin
  if to_char(d, 'MM-DD') in
     ('01-01','04-21','05-01','09-05','09-07','10-12','11-02','11-15','11-20','12-08','12-25')
  then return true; end if;
  -- carnaval (segunda e terça), sexta-feira santa, corpus christi
  if d in (p - 48, p - 47, p - 2, p + 60) then return true; end if;
  return false;
end $$;

create or replace function public.fn_quinto_dia_util(p_ref date)
returns date language plpgsql immutable as $$
declare d date := date_trunc('month', p_ref)::date; n int := 0; guarda int := 0;
begin
  loop
    if extract(isodow from d) < 6 and not public.fn_feriado(d) then
      n := n + 1;
      if n = 5 then return d; end if;
    end if;
    d := d + 1;
    guarda := guarda + 1;
    -- mês com 40 dias não existe; a guarda é contra laço infinito se alguém
    -- marcar o mês inteiro como feriado
    if guarda > 40 then return d; end if;
  end loop;
end $$;

-- `<=` e não `<`: o próprio 5º dia útil ainda conta no mês anterior.
create or replace function public.fn_competencia_fechamento(d date)
returns text language sql immutable as $$
  select to_char(
    case when d <= public.fn_quinto_dia_util(d)
         then (date_trunc('month', d) - interval '1 month')
         else date_trunc('month', d)
    end, 'YYYY-MM');
$$;

alter table public.fechamentos
  add column if not exists competencia text
  generated always as (public.fn_competencia_fechamento(data)) stored;

create index if not exists fechamentos_competencia_idx on public.fechamentos (competencia);

comment on column public.fechamentos.competencia is
  'Mês a que o fechamento pertence (YYYY-MM). Regra do escritório: tudo até o 5º dia útil conta no mês anterior. Coluna gerada — não dá pra editar à mão, e nunca sai do ar com a data.';

-- o troféu de fim de mês passa a contar pela mesma régua
create or replace function public.fn_trofeu_fim_mes(p_ref date default current_date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_rubricas int; v_valor numeric; v_valor_fmt text; v_mes text; v_titulo text; v_corpo text;
        v_comp text;
begin
  v_comp := public.fn_competencia_fechamento(p_ref);
  select coalesce(sum(coalesce(array_length(rubricas, 1), 0)), 0) into v_rubricas
    from public.fechamentos where competencia = v_comp;
  select coalesce(sum(valor_causa), 0) into v_valor
    from public.processos
    where date_trunc('month', created_at) = date_trunc('month', p_ref)
      and fase_processual is distinct from 'ARQUIVADO';
  v_mes := (array['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
                  'Agosto','Setembro','Outubro','Novembro','Dezembro'])[split_part(v_comp,'-',2)::int];
  v_valor_fmt := public.fn_fmt_brl(v_valor);
  v_titulo := '🏆 Fechamento de ' || v_mes;
  v_corpo := 'Parabéns, time! ' || v_rubricas || ' novas rúbricas ajuizáveis e ' || v_valor_fmt
             || ' em valor ajuizado no mês.';
  perform public.fn_criar_notificacao(
    'trofeu_mes', v_titulo, v_corpo,
    jsonb_build_object('rubricas', v_rubricas, 'valor', v_valor,
                       'mes', v_mes, 'valor_fmt', v_valor_fmt),
    '/fechamentos', null, null);
  return jsonb_build_object('rubricas', v_rubricas, 'valor', v_valor, 'titulo', v_titulo, 'corpo', v_corpo);
end; $function$;
