-- O NOME DO REQUERIDO É SEMPRE MAIÚSCULO.
--
-- A ficha põe matéria e requerido um embaixo do outro, e a matéria vem da
-- planilha em caixa alta. Com o réu em caixa mista logo abaixo — "ALIMENTO
-- CONTAMINADO" sobre "Nestle Brasil Ltda" — as duas linhas parecem vir de
-- sistemas diferentes, que é exatamente a sensação que esta faxina existe para
-- tirar.
--
-- A caixa mista não era escolha nossa: é o DJEN, que escreve "BANCO BRADESCO"
-- numa publicação e "Nestle Brasil Ltda" na outra. Herdar a inconsistência da
-- fonte é herdar o problema.
--
-- MAIÚSCULA NO DADO, E NÃO NO CSS. Uma classe `uppercase` deixaria o campo de
-- edição, a lista de sugestões e qualquer relatório futuro ainda em caixa
-- mista: a tela ficaria bonita escondendo um catálogo torto, e o próximo nome
-- digitado entraria torto de novo.
--
-- OS ACENTOS FICAM: PREVIDÊNCIA, LOCAÇÃO, ÂMBAR. Tirar acento seria outra
-- decisão, e uma que empobrece o nome próprio de uma empresa.
--
-- Conferido antes de aplicar: nenhum par de nomes do catálogo colide ao subir
-- para maiúscula, então o `unique` em `nome` continua satisfeito.

-- ── 1. o que já está gravado ────────────────────────────────────────────────
update public.requeridos_catalogo set nome = upper(nome) where nome <> upper(nome);

-- ── 2. quem canoniza passa a devolver maiúscula ─────────────────────────────
--
-- O `upper()` embrulha o CASE inteiro em vez de repetir em cada braço: um
-- braço novo adicionado amanhã já nasce dentro da regra, sem depender de quem
-- escreveu lembrar dela.
create or replace function public.fn_requerido_canonico(bruto text)
returns text
language sql
immutable
as $function$
  select upper(case
    when bruto is null or btrim(bruto) = '' then null
    when bruto ilike '%BRADESCO VIDA%'                                  then 'Bradesco Vida e Previdência'
    when bruto ilike '%BRADESCO%'                                       then 'Banco Bradesco'
    when bruto ilike '%BMG%'                                            then 'Banco BMG'
    when bruto ilike '%POUPEX%' or bruto ilike '%POUPANÇA E EMPR%'      then 'POUPEX / FHE'
    when bruto ilike '%AMAZONAS DIST%' or bruto ilike '%AMBAR%'         then 'Amazonas Energia (Âmbar)'
    when bruto ilike '%DEPARTAMENTO DE TRANSITO%'                       then 'DETRAN/AM'
    when bruto ilike '%ESTADO DO AMAZONAS%'                             then 'Estado do Amazonas'
    when bruto ilike '%YAMAHA%'                                         then 'Banco Yamaha'
    when bruto ilike '%ASSURANT%'                                       then 'Assurant Seguradora'
    when bruto ilike '%FACTA%'                                          then 'Facta Financeira'
    when bruto ilike '%CARREFOUR%'                                      then 'Banco Carrefour'
    when bruto ilike '%MANAUS AMBIENTAL%'                               then 'Manaus Ambiental'
    when bruto ilike '%NG CASH%'                                        then 'NG Cash'
    when bruto ilike '%BANCO PAN%'                                      then 'Banco Pan'
    when bruto ilike '%CREFISA%'                                        then 'Crefisa'
    when bruto ilike '%ITAUCARD%'                                       then 'Itaucard'
    when bruto ilike '%ITAU%'                                           then 'Itaú Unibanco'
    when bruto ilike '%DAYCOVAL%'                                       then 'Banco Daycoval'
    when bruto ilike '%CARDIF%'                                         then 'Cardif Seguros'
    when bruto ilike '%BANCO DO BRASIL%'                                then 'Banco do Brasil'
    when bruto ilike '%INVESTPREV%'                                     then 'Investprev Seguradora'
    when bruto ilike '%AGIBANK%'                                        then 'Agibank'
    when bruto ilike '%UNINORTE%' or bruto ilike '%CENESUP%'            then 'UniNorte (CENESUP)'
    when bruto ilike '%AVANCARD%' or bruto ilike '%PROVER PROMO%'       then 'Avancard (Prover)'
    else btrim(regexp_replace(
           regexp_replace(btrim(bruto), '\s*[-–]\s*$', ''),
           '\s+', ' ', 'g'))
  end);
$function$;

comment on function public.fn_requerido_canonico(text) is
  'Junta as grafias do mesmo requerido e devolve SEMPRE em maiuscula. NAO junta Banco Bradesco com Bradesco Vida e Previdencia: sao PJs distintas.';

-- ── 3. a trava ──────────────────────────────────────────────────────────────
--
-- Sem isto, a regra vale só para o que passou por aqui hoje: qualquer insert
-- futuro — da tela, de um script, de um gatilho novo — voltaria a aceitar caixa
-- mista, e o catálogo despadronizaria de novo sem ninguém perceber. A trava é o
-- que faz "sempre maiúsculo" ser verdade, e não intenção.
alter table public.requeridos_catalogo
  drop constraint if exists requeridos_catalogo_nome_maiusculo;
alter table public.requeridos_catalogo
  add constraint requeridos_catalogo_nome_maiusculo check (nome = upper(nome));
