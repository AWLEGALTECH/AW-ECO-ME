-- A MATÉRIA DE UM PROCESSO DO BRADESCO PASSA A SER O PRODUTO DO WRITER.
--
-- Hoje ela é texto livre copiado da planilha, e o mesmo processo tem três
-- nomes possíveis: `BX ANT FINAN/PARC CRED/GASTOS CARTÃO`,
-- `GASTOS CARTÃO/PARC CRED/ BX ANT FINAN` e `PARCELA /GASTOS CARTÃO/BX ANT
-- FINAN` são a MESMA ação, escrita por três pessoas diferentes. São 137
-- grafias distintas para 428 processos.
--
-- ─────────────────────── por que a barra não é mistura ───────────────────────
--
-- A leitura que sustenta esta migração: a barra nunca significou "misturei
-- teses". Ela lista as RUBRICAS DO MESMO MODELO. Medido nos 283 do Bradesco:
-- dos 92 processos com mais de uma rubrica, 81 ficam dentro de um único
-- produto do Writer e só 9 cruzam produtos.
--
-- As combinações que aparecem são exatamente os produtos:
--     BX Ant. Financiamento + Gasto cartão + Parcela  = Débitos Automáticos
--     Emissão extrato + Saque terminal + Extrato mov. = Tarifas Bancárias
--     Mora + Encargos                                  = Juros e encargos
--
-- Por isso trocar o nome não perde informação: o que a barra dizia continua
-- gravado em `materia_rubricas`, e a tela passa a mostrar as rubricas em linhas
-- embaixo do nome do produto.
--
-- ⚠️ O TEXTO ORIGINAL É GUARDADO ANTES. `processos_materia_bkp_20260909` fica
-- com o par (id, matéria antiga). Uma renomeação em massa que não dá pra
-- desfazer é uma aposta, e esta base já teve um clique apagar 635 leads.

-- ── 1. o backup ─────────────────────────────────────────────────────────────
create table if not exists public.processos_materia_bkp_20260909 as
select id, materia, materia_rubricas, now() as salvo_em from public.processos;

comment on table public.processos_materia_bkp_20260909 is
  'Materia dos processos ANTES da padronizacao pelo produto do Writer (09/09/2026).';

-- ── 2. de que produto do Writer é este conjunto de rubricas ─────────────────
--
-- Devolve NULL de propósito em três casos, e cada um é uma recusa diferente:
--
--   ESPECÍFICA          não é matéria, é a ausência dela. Por definição não tem
--                       modelo, e forçar um seria inventar.
--   rubrica sem produto  RCC, RMC, operações vencidas, reorganização
--                       financeira, bloqueio de conta, seguro veicular, mora de
--                       operações. O Writer não tem peça para elas; dizer que
--                       tem seria mentir na ficha.
--   sem rubrica          nada a decidir.
--
-- Nesses casos o nome fica como está e o processo aparece na lista de
-- pendências, que é honesto. O contrário (empurrar para o produto mais
-- parecido) produziria uma ficha bem preenchida e errada, que é o defeito que
-- não se descobre.
create or replace function public.fn_produto_writer(p_rubricas text[])
returns text
language plpgsql
immutable
as $function$
declare
  v_produtos text[];
  v_sem_produto int;
begin
  if p_rubricas is null or array_length(p_rubricas, 1) is null then return null; end if;
  if 'ESPECIFICA' = any(p_rubricas) then return null; end if;

  with mapa(produto, chave) as (values
    ('Débitos Automáticos','GASTO_C_CRED'),
    ('Débitos Automáticos','PARC_CRED_PESS'),
    ('Débitos Automáticos','BX_ANT_FIN'),
    ('Tarifas Bancárias','SAQUE_TERMINAL'),
    ('Tarifas Bancárias','EMISSAO_EXTRATO'),
    ('Tarifas Bancárias','EXTRATO_MOVIMENTO'),
    ('Juros e encargos indevidos','MORA'),
    ('Juros e encargos indevidos','MORA_C_CREDITO'),
    ('Juros e encargos indevidos','ENCARGOS_EXCESSO'),
    ('Juros e encargos indevidos','ENCARGOS_DESCOBERTOS'),
    ('Seguro Prestamista','SEGURO_PRESTAMISTA'),
    ('Vida e Previdência','VIDA_PREV'),
    ('Título de Capitalização','TIT_CAP'),
    ('Cesta de Serviços','CESTA'),
    ('Anuidade Cartão','ANUIDADE'),
    ('Dívida em Atraso','DIV_ATRASO'),
    /* A rubrica genérica SEGURO, no Bradesco, é o cartão protegido: os cinco
       processos que a usam se chamam todos "SEGURO CARTÃO". Fora do Bradesco
       essa igualdade não vale, e é por isso que esta migração mexe só nele. */
    ('Seguro Cartão Protegido','SEGURO')
  )
  select array_agg(distinct m.produto),
         (select count(*) from unnest(p_rubricas) x
           where not exists (select 1 from mapa m2 where m2.chave = x))
    into v_produtos, v_sem_produto
    from mapa m where m.chave = any(p_rubricas);

  if v_sem_produto > 0 then return null; end if;
  if v_produtos is null then return null; end if;

  /* Mais de um produto é o Mix, que existe no Writer exatamente para isso.
     São 9 processos: pouco, e não é exceção mal resolvida. */
  if array_length(v_produtos, 1) > 1 then return 'Mix Bradesco'; end if;
  return v_produtos[1];
end $function$;

comment on function public.fn_produto_writer(text[]) is
  'O produto do Writer correspondente a um conjunto de rubricas. NULL quando nao ha modelo: especifica, rubrica sem produto, ou sem rubrica.';

-- ── 3. os processos do Bradesco ganham o nome do produto ────────────────────
update public.processos p
   set materia = public.fn_produto_writer(p.materia_rubricas)
 where public.fn_produto_writer(p.materia_rubricas) is not null
   and exists (
     select 1 from unnest(p.requeridos) k
      join public.requeridos_catalogo rc on rc.chave = k
     where rc.nome = 'BANCO BRADESCO'
   );

-- ── 4. as que não têm produto ao menos param de ter três grafias ────────────
--
-- `REORG FINANCEIRA` e `REORGANIZAÇÃO FINANCEIRA` são a mesma coisa, e
-- `BLOOQUEIO DE CONTA` é um erro de digitação virado categoria. Elas não ganham
-- produto (não existe), mas ganham o rótulo do catálogo, que já é o nome certo.
-- Padronizar o nome e admitir que não há modelo são coisas independentes.
update public.processos p
   set materia = mc.rotulo
  from public.materias_catalogo mc
 where array_length(p.materia_rubricas, 1) = 1
   and mc.chave = p.materia_rubricas[1]
   and public.fn_produto_writer(p.materia_rubricas) is null
   and 'ESPECIFICA' <> all(p.materia_rubricas)
   and exists (
     select 1 from unnest(p.requeridos) k
      join public.requeridos_catalogo rc on rc.chave = k
     where rc.nome = 'BANCO BRADESCO'
   );

-- ── 5. a ESPECÍFICA mantém a tese, e perde o travessão ─────────────────────
--
-- "ESPECÍFICA — FRAUDE EMPRÉSTIMOS" guarda o que a peça atacou, e a rubrica
-- `ESPECIFICA` sozinha perdeu isso. O nome fica, com dois-pontos no lugar do
-- travessão, que não deve aparecer em texto que alguém lê.
update public.processos p
   set materia = regexp_replace(p.materia, '^\s*ESPEC[ÍI]FICA\s*[—–-]\s*', 'Específica: ', 'i')
 where p.materia ~* '^\s*ESPEC[ÍI]FICA\s*[—–-]'
   and exists (
     select 1 from unnest(p.requeridos) k
      join public.requeridos_catalogo rc on rc.chave = k
     where rc.nome = 'BANCO BRADESCO'
   );
