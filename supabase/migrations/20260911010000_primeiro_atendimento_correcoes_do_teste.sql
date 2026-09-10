-- TRÊS DEFEITOS QUE O TESTE DO PRIMEIRO ATENDIMENTO ACHOU.
--
-- Os três só apareceram simulando a coisa inteira num bloco desfeito no fim
-- (dois leads na mesma madrugada, um deles sem nome, um cliente antigo junto).
-- Nenhum deles daria erro em lugar nenhum: dariam mensagem errada, ou mensagem
-- nenhuma, de madrugada, sem ninguém olhando.

-- ── 1. "atendemos a partir das {horario}" dizia "em breve" ──────────────────
-- A busca da próxima faixa devolvia só a faixa IMEDIATAMENTE seguinte. Para
-- quem escrevia de madrugada, a seguinte era o direcionamento das 8h, e o
-- filtro por atendimento não achava nada. A frase caía no "em breve" justamente
-- no caso em que ela mais importa.
--
-- ── 2. oito dias não bastavam ───────────────────────────────────────────────
-- Uma grade que só tem segunda, com essa segunda marcada como feriado, faz a
-- próxima cair no oitavo dia: fora da janela. A função devolvia nada, e nada
-- aqui vira lead sem a segunda mensagem, calado. Catorze dias cobrem a grade
-- inteira mais uma semana bloqueada.
create or replace function public.fn_wa_proxima_faixa(
  p_instancia text, p_de timestamptz default now(), p_faixa text default null
)
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

  for d in 0..14 loop
    return query
      select ((local::date + d) + h.inicio) at time zone c.fuso, h.faixa
        from public.wa_horarios h
       where h.instancia = p_instancia
         and h.dia = extract(dow from local::date + d)::int
         and ((local::date + d) + h.inicio) > local
         and (p_faixa is null or h.faixa = p_faixa)
         and (c.fechado_em is null or c.fechado_em <> (local::date + d))
       order by h.inicio
       limit 1;
    if found then return; end if;
  end loop;
end $function$;

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
      from public.fn_wa_proxima_faixa(v_inst, p_quando, 'atendimento') x
      join public.wa_atendimento_config cfg on cfg.instancia = v_inst
     limit 1;
    t := replace(t, '{horario}', coalesce(v_hora, 'em breve'));
  end if;

  if coalesce(v_nome, '') = '' then
    t := regexp_replace(t, '[,\s]*\{nome\}', '', 'g');
  else
    t := replace(t, '{nome}', v_nome);
  end if;

  return btrim(regexp_replace(t, '[ \t]{2,}', ' ', 'g'));
end $function$;

-- ── 3. o segundo lead da madrugada só receberia resposta no dia seguinte ────
-- O minuto livre era "um minuto depois da última da fila". Bastava existir uma
-- mensagem marcada para amanhã de manhã (a SEGUNDA mensagem do primeiro lead,
-- justamente) para a mensagem IMEDIATA do lead seguinte ser empurrada para
-- amanhã junto. Ele escrevia às 3h e ficava sem resposta a noite inteira, e o
-- erro só aparecia com dois leads na mesma noite.
--
-- A pergunta certa é outra: qual o primeiro minuto, a partir daqui, em que este
-- número não tem nada marcado. Duas horas de janela cobrem uma fila de até 120
-- mensagens; passando disso elas empilham no fim, que é melhor que furar a fila.
create or replace function public.fn_wa_minuto_livre(p_instancia text, p_de timestamptz)
returns timestamptz
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (select m
       from generate_series(date_trunc('minute', p_de),
                            date_trunc('minute', p_de) + interval '120 minutes',
                            interval '1 minute') m
      where not exists (
        select 1 from public.wa_agendadas a
          join public.wa_conversas c on c.id = a.conversa_id
         where c.instancia = p_instancia
           and a.status = 'pendente'
           and date_trunc('minute', a.quando) = m)
      order by m
      limit 1),
    date_trunc('minute', p_de) + interval '120 minutes'
  );
$function$;
