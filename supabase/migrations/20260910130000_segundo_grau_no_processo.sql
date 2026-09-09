-- SEGUNDO GRAU NA FICHA DO PROCESSO.
--
-- Pedido no chamado "Criar campo na ficha do processo": ao avançar para
-- AG. ACÓRDÃO, é obrigatório dizer em qual câmara ou turma o processo está,
-- para ficar salvo. A ficha ganha um card de segundo grau com a data em que o
-- processo subiu, o órgão julgador (câmara ou turma) e o relator.
--
-- As três colunas ficam em `processos` mesmo: são atributos do processo, um
-- por processo, e a ficha já lê a linha inteira.

alter table public.processos
  add column if not exists segundo_grau_data_subida date,
  add column if not exists segundo_grau_orgao       text,
  add column if not exists segundo_grau_relator     text;

comment on column public.processos.segundo_grau_data_subida is 'Data em que o processo subiu ao segundo grau (remessa/distribuicao).';
comment on column public.processos.segundo_grau_orgao       is 'Orgao julgador do segundo grau: camara ou turma recursal. Obrigatorio quando o status e de acordao.';
comment on column public.processos.segundo_grau_relator     is 'Relator no segundo grau (opcional).';

-- O DJEN costuma nomear o órgão ("2ª TURMA RECURSAL", "PRIMEIRA CÂMARA CÍVEL")
-- no cabeçalho das publicações do segundo grau. Esta função lê as publicações
-- do processo e devolve o órgão ESPECÍFICO mais recente que encontrar e a data
-- da primeira publicação que o cita. É SUGESTÃO para a tela: quem confirma é a
-- pessoa.
--
-- "TURMA RECURSAL" sem número não conta: aparece em despacho de primeiro grau
-- ("remetam-se os autos à turma recursal", na própria sentença) e por isso nem
-- diz qual turma nem marca a data em que o processo subiu. Conferido na
-- carteira: dos 36 processos em segundo grau, 9 têm órgão específico no DJEN
-- e os outros só têm essa menção genérica, com data de sentença.
create or replace function public.fn_segundo_grau_do_djen(p_numero text)
returns table (orgao text, data date)
language sql
stable
set search_path to 'public'
as $function$
  with pub as (
    select pu.data_publicacao dt,
           regexp_replace(regexp_replace(pu.conteudo, '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g') txt
      from public.publicacoes pu
     where pu.numero_processo = p_numero and pu.conteudo is not null
  ),
  achado as (
    select dt, upper(m[1]) orgao
      from pub,
           lateral regexp_match(txt,
             '(\d+ª\s+TURMA\s+RECURSAL|(?:PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA|QUINTA)\s+C[ÂA]MARA\s+C[ÍI]VEL|\d+ª\s+C[ÂA]MARA\s+C[ÍI]VEL|C[ÂA]MARAS\s+REUNIDAS)',
             'i') m
     where m is not null
  ),
  melhor as (
    select orgao from achado
     order by dt desc
     limit 1
  )
  select melhor.orgao,
         (select min(a.dt) from achado a where a.orgao = melhor.orgao)
    from melhor;
$function$;

grant execute on function public.fn_segundo_grau_do_djen(text) to authenticated;
