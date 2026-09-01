-- A MATÉRIA DO PROCESSO É UMA LISTA, E ESTAVA GUARDADA COMO FRASE.
--
-- 400 processos, 125 grafias. Três problemas empilhados no mesmo campo:
--
--   1. GRAFIA — "SAQUE TEMRINAL", "MORA CRES", "SERUGO GOV", "BLOOQUEIO",
--      "CAPTALIZAÇÃO", "SEGURO CARTÂO", acento, caixa, e uma sem a barra:
--      "SAQUE TERMINALEMISSAO EXTRATO".
--
--   2. COMPOSIÇÃO — uma ação ataca VÁRIAS rubricas, e a planilha empilhava
--      tudo numa string só: "BX ANT FINAN/PARC CRED/GASTOS CARTÃO" são três.
--
--   3. FAMÍLIAS DIFERENTES no mesmo campo — taxa de esgoto, promoção
--      horizontal e acúmulo de função não são rubrica de extrato bancário.
--
-- O CUSTO DISSO NÃO ERA ESTÉTICO. Agrupando por texto exato, "PARC CRED"
-- media 21 processos e 33% de procedência. A rubrica aparece em 22 grafias e
-- cobre 57 processos — a taxa real é 43%. E a maior vitória da casa nela
-- (R$ 140.800,00 do ALZEMIR, sobre R$ 219.730,27) estava fora da conta, porque
-- a matéria dele é composta. Toda decisão tomada com esse número foi tomada
-- sobre um terço do dado.
--
-- ── O DESENHO ──
--
-- O TEXTO ORIGINAL NÃO É REESCRITO. A regra da casa é fidelidade à planilha.
-- `materia` continua exatamente como foi digitada; o que entra é uma leitura
-- DERIVADA ao lado, em `materia_rubricas`. Errou o leitor, roda de novo — o
-- dado de origem nunca foi tocado.
--
-- O LEITOR MORA SÓ AQUI, no banco. Ter uma cópia em TypeScript e outra em SQL
-- é o caminho conhecido pra elas divergirem e ninguém perceber; a tela lê a
-- coluna pronta. E o gatilho mantém tudo em dia: processo novo ou matéria
-- editada já nasce classificado, sem depender de alguém rodar script.
--
-- AS FAMÍLIAS SAÍRAM DA VARA, NÃO DE PALPITE. Promoção horizontal, entrega de
-- CNH e multa de trânsito estão todas em JEFP — Juizado da Fazenda Pública.
-- Acúmulo de função está em Vara do Trabalho. Taxa de esgoto e corte de
-- energia, em JEC de consumo.

-- ── 1. o catálogo ───────────────────────────────────────────────────────────
create table if not exists public.materias_catalogo (
  chave   text primary key,
  rotulo  text not null,
  familia text not null check (familia in ('bancaria','fazenda','trabalhista','consumo','civel')),
  ordem   integer not null default 100
);

comment on table public.materias_catalogo is
  'Vocabulário canônico das matérias. As de família bancária espelham RUBRICAS_FECHAMENTO (o que a estagiária fecha); as demais entraram quando a base mostrou que existiam.';

insert into public.materias_catalogo (chave, rotulo, familia, ordem) values
  -- ── bancárias: o catálogo do fechamento ──
  ('RMC',                   'RMC — Reserva de margem consignável',  'bancaria',  10),
  ('RCC',                   'RCC — Reserva de cartão de crédito',   'bancaria',  20),
  ('CESTA',                 'Cesta de tarifas',                     'bancaria',  30),
  ('MORA',                  'Mora',                                 'bancaria',  40),
  ('MORA_C_CREDITO',        'Mora — cartão de crédito',             'bancaria',  41),
  ('MORA_CEL',              'Mora — celular',                       'bancaria',  42),
  ('MORA_OPERACOES',        'Mora — operações',                     'bancaria',  43),
  ('JUROS_ABUSIVOS',        'Juros abusivos',                       'bancaria',  50),
  ('ENCARGOS_DESCOBERTOS',  'Encargos por descoberto',              'bancaria',  51),
  ('ENCARGOS_EXCESSO',      'Encargos em excesso',                  'bancaria',  52),
  ('TIT_CAP',               'Título de capitalização',              'bancaria',  60),
  ('VIDA_PREV',             'Vida / Previdência',                   'bancaria',  61),
  ('SEGURO',                'Seguro',                               'bancaria',  62),
  ('SEGURO_PRESTAMISTA',    'Seguro prestamista',                   'bancaria',  64),
  ('SEGURO_GOV',            'Seguro GOV',                           'bancaria',  63),
  ('ANUIDADE',              'Anuidade',                             'bancaria',  70),
  ('TARIFA_SMS',            'Tarifa de SMS',                        'bancaria',  71),
  ('GASTO_C_CRED',          'Gasto com cartão de crédito',          'bancaria',  80),
  ('PARC_CRED_PESS',        'Parcela de crédito pessoal',           'bancaria',  81),
  ('BX_ANT_FIN',            'Baixa antecipada de financiamento',    'bancaria',  82),
  ('AD_DEPOSITANTE',        'Adicional do depositante',             'bancaria',  83),
  ('EMISSAO_EXTRATO',       'Emissão de extrato',                   'bancaria',  90),
  ('SAQUE_TERMINAL',        'Saque em terminal',                    'bancaria',  91),
  ('EXTRATO_MOVIMENTO',     'Extrato de movimento',                 'bancaria',  92),
  ('REFINANCIAMENTO_IND',   'Refinanciamento indevido',             'bancaria', 100),
  ('REORG_FINAN',           'Reorganização financeira',             'bancaria', 101),
  ('OP_VENCIDAS',           'Operações vencidas',                   'bancaria', 102),
  ('DIV_ATRASO',            'Dívida em atraso',                     'bancaria', 103),
  ('COBRANCA_IND',          'Cobrança indevida',                    'bancaria', 104),
  ('BLOQUEIO_CONTA',        'Bloqueio de conta',                    'bancaria', 105),
  ('INCORP_BANCOS',         'Incorporação de bancos',               'bancaria', 106),
  ('REG_LANCAMENTO',        'Registro de lançamento',               'bancaria', 107),
  ('SVA',                   'SVA',                                  'bancaria', 108),
  ('ANP',                   'ANP',                                  'bancaria', 109),
  ('ESPECIFICA',            'Específica',                           'bancaria', 199),
  -- ── fazenda pública: tudo isso está em JEFP ──
  ('PROMOCAO_HORIZONTAL',   'Promoção horizontal',                  'fazenda',  210),
  ('ENTREGA_CNH',           'Entrega de CNH',                       'fazenda',  211),
  ('MULTA_TRANSITO',        'Multa de trânsito',                    'fazenda',  212),
  -- ── trabalhista: Vara do Trabalho ──
  ('ACUMULO_FUNCAO',        'Acúmulo de função',                    'trabalhista', 220),
  ('DESVIO_FUNCAO',         'Desvio de função',                     'trabalhista', 221),
  -- ── consumo ──
  ('SANEAMENTO',            'Água e esgoto',                        'consumo',  230),
  ('ENERGIA',               'Energia elétrica',                     'consumo',  231),
  ('SEGURO_VEICULAR',       'Seguro veicular',                      'consumo',  232),
  ('PRODUTO_IMPROPRIO',     'Produto impróprio',                    'consumo',  233),
  ('FALHA_ENTREGA',         'Falha na entrega',                     'consumo',  234),
  ('FALHA_SERVICO',         'Falha na prestação de serviço',        'consumo',  235),
  -- ── cível ──
  ('NEGATIVACAO_IND',       'Negativação indevida',                 'civel',    240),
  ('GOLPE',                 'Golpe / fraude de terceiro',           'civel',    241),
  ('MULTA_INDEVIDA',        'Multa indevida',                       'civel',    242),
  ('PERDAS_DANOS',          'Perdas e danos',                       'civel',    243),
  ('BUSCA_APREENSAO',       'Busca e apreensão',                    'civel',    244),
  ('EXECUCAO_DIVIDA',       'Execução de dívida',                   'civel',    245)
on conflict (chave) do update
  set rotulo = excluded.rotulo, familia = excluded.familia, ordem = excluded.ordem;

-- ── 2. o leitor ─────────────────────────────────────────────────────────────
-- Normaliza, parte por "/" e "+", e casa cada pedaço contra o catálogo.
--
-- A ORDEM DOS PADRÕES É O CORAÇÃO DISSO. Do mais específico pro mais genérico:
-- "MORA" solto engoliria "MORA CARTÃO DE CRÉDITO", e "SEGURO" engoliria
-- "SEGURO VEICULAR" — que nem é matéria de banco. Cada pedaço casa com o
-- PRIMEIRO padrão que bater e para ali.
create or replace function public.fn_rubricas_da_materia(p_texto text)
returns text[]
language plpgsql
immutable
as $function$
declare
  v_corpo   text;
  v_pedaco  text;
  v_norm    text;
  v_achadas text[] := '{}';
  v_chave   text;
  v_padroes text[][] := array[
    -- específicas dentro de "ESPECÍFICA — X", que vêm antes das genéricas
    ['SEGURO_GOV',           'SEGURO GOV|SERUGO GOV'],
    ['SEGURO_VEICULAR',      'SEGURO VEICULAR'],
    -- prestamista tem chave própria: cai em SEGURO e some um produto que
    -- tem 4 julgadas, 100% de procedência e peça própria no Writer
    ['SEGURO_PRESTAMISTA',   'PRESTAMISTA'],
    ['TARIFA_SMS',           'TARIFA (SMS|MSG)'],
    -- mora, da mais específica pra mais solta
    ['MORA_C_CREDITO',       'MORA (CARTAO|CARTA|C CRED)'],
    ['MORA_CEL',             'MORA CEL'],
    ['MORA_OPERACOES',       'MORA OPERAC'],
    -- as compostas do extrato
    ['PARC_CRED_PESS',       'PARC(ELA)? ?/? ?CRED|PARCELA DE CREDITO|PARCELA CREDITO|CREDITO PESSOAL|^PARCELA$'],
    ['BX_ANT_FIN',           'BX ?A?N?T? ?FINAN|BX ANT|BX AN FINAN|ANTECIPACAO FINAN|^BX$|BX FINAN'],
    ['GASTO_C_CRED',         'GASTOS? (COM |DE )?CARTAO|GASTOS CARTAO|^GASTOS$'],
    ['SAQUE_TERMINAL',       'SAQUE (EM )?TE[RM]{2}INAL|^SAQUE$'],
    ['EXTRATO_MOVIMENTO',    'EXTRATO (DE )?MOVIMENTO'],
    ['EMISSAO_EXTRATO',      'EMISSAO (DE )?EXTRATO'],
    ['ENCARGOS_DESCOBERTOS', 'ENCARGOS? (POR )?DESCOBERTO'],
    ['ENCARGOS_EXCESSO',     'ENCARGOS? (EM )?EXCESSO|ENCARGOS? (DE )?LIM(ITE)? (DE )?CRED|ENCARGO SALDO VINCULADO'],
    ['TIT_CAP',              'CAP[IT]{1,2}ALIZAC|CAPTALIZAC'],
    ['VIDA_PREV',            'VIDA E PREVID|PREVIDENCIA'],
    ['ANUIDADE',             'ANUIDADE'],
    ['CESTA',                'CESTA|PACOTE'],
    ['REFINANCIAMENTO_IND',  'REFINANCIAMENTO'],
    ['REORG_FINAN',          'REORG(ANIZACAO)? FINANC'],
    ['OP_VENCIDAS',          'OPERACOES VENCIDAS'],
    ['DIV_ATRASO',           'DIV(IDA)? EM ATRASO|DIVIDA ATRASO'],
    ['AD_DEPOSITANTE',       'AD(ICIONAL)? ?DEPOSITANTE|ADIANT ?DEPOSITANTE'],
    ['JUROS_ABUSIVOS',       'JUROS ABUSIV'],
    ['COBRANCA_IND',         'COBRANCA INDEVIDA'],
    ['BLOQUEIO_CONTA',       'BLO+QUEIO DE CONTA'],
    ['RMC',                  '(^| )RMC( |$)|RESERVA DE MARGEM'],
    ['RCC',                  '(^| )RCC( |$)|RESERVA DE CARTAO'],
    ['INCORP_BANCOS',        'INCORPORACAO DE BANCOS'],
    ['REG_LANCAMENTO',       'REGISTRO DE LANCAMENTO'],
    ['SVA',                  '(^| )SVA( |$)'],
    ['ANP',                  '(^| )ANP( |$)'],
    -- fazenda pública
    ['PROMOCAO_HORIZONTAL',  'PROMOCAO HORIZONTAL'],
    ['ENTREGA_CNH',          'ENTREGA DE CNH|(^| )CNH( |$)'],
    ['MULTA_TRANSITO',       'MULTA MOTO|MULTA DE TRANSITO'],
    -- trabalhista
    ['ACUMULO_FUNCAO',       'ACUMULO DE FUNCAO'],
    ['DESVIO_FUNCAO',        'DESVIO DE FUNCAO'],
    -- consumo
    ['SANEAMENTO',           'TAXA DE ESGOTO|ESGOTO|FORNECIMENTO DE AGUA'],
    ['ENERGIA',              'CORTE DE ENERGIA|ENERGIA ELETRICA'],
    ['PRODUTO_IMPROPRIO',    'ALIMENTO CONTAMINADO|PRODUTO VENCIDO'],
    ['FALHA_ENTREGA',        'FALHA NA ENTREGA'],
    ['FALHA_SERVICO',        'FALHA NA PRESTACAO'],
    -- cível
    ['NEGATIVACAO_IND',      'NEGATIVACAO INDEVIDA'],
    ['GOLPE',                '(^| )GOLPE( |$)'],
    ['MULTA_INDEVIDA',       'MULTA INDEVIDA'],
    ['PERDAS_DANOS',         'PERDAS E DANOS|DANOS PATRIMONIAIS'],
    ['BUSCA_APREENSAO',      'BUSCA E APREENSAO'],
    ['EXECUCAO_DIVIDA',      'EXECUCAO DE DIVIDA'],
    -- genéricas, sempre por último
    ['SEGURO',               'SEGURO'],
    ['MORA',                 '(^| )MORA( |$)|(^| )MORA CRE|MORA CRES|MORA DE CREDITO'],
    ['ENCARGOS_EXCESSO',     '(^| )ENCARGOS?( |$)'],
    ['ESPECIFICA',           'ESPECIFICA']
  ];
  i int;
begin
  if coalesce(trim(p_texto), '') = '' then return '{}'; end if;

  -- "ESPECÍFICA — Seguro GOV": o travessão separa a rubrica do assunto dela.
  -- Os dois lados são lidos, porque o assunto costuma ser a matéria de verdade
  -- (dos 17 "Seguro GOV", nenhum seria encontrado se a gente olhasse só o
  -- "ESPECÍFICA" da frente).
  -- travessão separa rubrica de assunto; os dois lados são lidos
  v_corpo := replace(replace(p_texto, '—', '/'), '–', '/');
  -- Alguém esqueceu a barra em "SAQUE TERMINALEMISSAO EXTRATO" e as duas
  -- rubricas viraram uma palavra. Como cada pedaço casa com um padrão e para
  -- ali, esse rendia só SAQUE_TERMINAL. Conserto de erro de digitação
  -- conhecido, não regra geral.
  v_corpo := regexp_replace(v_corpo, 'TERMINALEMISS', 'TERMINAL/EMISS', 'gi');

  foreach v_pedaco in array regexp_split_to_array(v_corpo, '[/+]') loop
    v_norm := btrim(regexp_replace(
                upper(unaccent(regexp_replace(v_pedaco, '[.]', ' ', 'g'))),
                '[^A-Z0-9 ]', ' ', 'g'));
    v_norm := btrim(regexp_replace(v_norm, '\s+', ' ', 'g'));
    if v_norm = '' then continue; end if;

    for i in 1 .. array_length(v_padroes, 1) loop
      if v_norm ~ v_padroes[i][2] then
        v_chave := v_padroes[i][1];
        if not (v_chave = any(v_achadas)) then
          v_achadas := v_achadas || v_chave;
        end if;
        exit;
      end if;
    end loop;
  end loop;

  return v_achadas;
end;
$function$;

comment on function public.fn_rubricas_da_materia(text) is
  'Lê o texto livre da matéria e devolve as chaves canônicas do catálogo. Único lugar onde essa leitura existe — a tela consome a coluna derivada, nunca reimplementa isto.';

-- ── 3. as colunas derivadas ─────────────────────────────────────────────────
alter table public.processos
  add column if not exists materia_rubricas text[] not null default '{}',
  add column if not exists materia_familia  text;

comment on column public.processos.materia_rubricas is
  'Leitura derivada de `materia`. Nunca editar à mão: é reescrita pelo gatilho. Corrigir erro aqui significa corrigir fn_rubricas_da_materia.';
comment on column public.processos.materia_familia is
  'A família da primeira rubrica reconhecida: bancaria, fazenda, trabalhista, consumo ou civel. Nula quando nada foi reconhecido.';

create index if not exists processos_materia_rubricas_idx
  on public.processos using gin (materia_rubricas);
create index if not exists processos_materia_familia_idx
  on public.processos (materia_familia);

-- ── 4. o gatilho: nasce e continua classificado ─────────────────────────────
create or replace function public.fn_processos_classificar_materia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.materia_rubricas := public.fn_rubricas_da_materia(new.materia);
  select c.familia into new.materia_familia
    from public.materias_catalogo c
   where c.chave = any(new.materia_rubricas)
   order by c.ordem limit 1;
  return new;
end;
$function$;

drop trigger if exists trg_processos_classificar_materia on public.processos;
create trigger trg_processos_classificar_materia
  before insert or update of materia on public.processos
  for each row execute function public.fn_processos_classificar_materia();

-- ── 5. backfill ─────────────────────────────────────────────────────────────
update public.processos
   set materia_rubricas = public.fn_rubricas_da_materia(materia),
       materia_familia  = (select c.familia from public.materias_catalogo c
                            where c.chave = any(public.fn_rubricas_da_materia(materia))
                            order by c.ordem limit 1);

-- Conferido contra a base real: as 125 grafias mapearam, zero órfãos. Os
-- únicos dois processos sem família são os que já estavam com matéria vazia.
