-- O REQUERIDO PASSA A SER DO PROCESSO, E QUEM RESPONDE É O TRIBUNAL.
--
-- Até aqui o réu morava em `clientes.requerido`: um campo de texto, no CLIENTE.
-- Isso não é um campo mal preenchido, é um campo no grão errado — e por isso
-- ele erra mesmo quando alguém preenche com cuidado. Os números da conferência
-- contra o DJEN, sobre 406 processos:
--
--     198 (49%)  o campo está VAZIO
--     138 (34%)  confere com o tribunal
--      22 ( 5%)  compatível, só grafia diferente
--      49 (12%)  DIVERGE do tribunal
--
-- E a divergência tem quase sempre a mesma causa: cliente com vários processos
-- e um campo só. ALBANIZA tem 7 processos; o cadastro diz "BANCO PAN" em todos,
-- e o tribunal diz TOO SEGUROS, FACTA, BANCO MERCANTIL (duas vezes) e BANCO
-- PARATI. Cinco réus espremidos numa linha. RAIMUNDA tem o cadastro dizendo
-- BANCO BRADESCO num processo de CORTE DE ENERGIA cujo réu é a distribuidora.
--
-- Das 49 divergências, 20 são o cadastro batendo com OUTRO processo do mesmo
-- cliente (não é erro, é lugar errado), 11 são apelido do mesmo réu
-- ("AVANCARD" vs "PROVER PROMOÇÃO DE VENDAS LTDA (AVANCARD)"), 14 são o
-- problema do grão, e só 4 são dois nomes realmente disputando um processo.
--
-- ────────────────────────── de onde vem a resposta ──────────────────────────
--
-- `publicacoes` guarda o DJEN, e as publicações de DISTRIBUIÇÃO vêm num formato
-- fixo, escrito pelo órgão que registrou o feito:
--
--     Apelante: SEBASTIÃO DUARTE FONSECA
--     Apelado:  BANCO BRADESCO S/A
--
-- `Apelado` é o requerido, por processo, na fonte oficial. Cobre 406 dos 428.
--
-- POR QUE SÓ AS DE DISTRIBUIÇÃO: decisões e intimações também citam partes, mas
-- em texto corrido. Extrair delas trouxe lixo como "ALZINO BERNARDES DA SILVA
-- DECIS O PRINCIPAL 239" e nomes de terceiros. Restringir ao formato fixo
-- levou os casos ambíguos de 8 para 1.
--
-- O MINISTÉRIO PÚBLICO SAI. Ele aparece como "Apelado" em dois processos, mas é
-- fiscal da lei, não réu — e deixá-lo entrar faria um processo do Bradesco
-- parecer um processo contra o MP.

-- ── 1. o catálogo de réus ───────────────────────────────────────────────────
--
-- Espelha `materias_catalogo`, que já existe e funciona: a coluna do processo
-- guarda CHAVES, e o nome de tela mora aqui. Trocar "Banco Bradesco S/A" por
-- "Banco Bradesco" passa a ser uma linha editada, e não um UPDATE em 272
-- processos.
create table if not exists public.requeridos_catalogo (
  chave      text primary key,
  nome       text not null unique,
  /* Grupo econômico, quando faz diferença. Nulo é o caso normal. */
  grupo      text,
  ordem      int not null default 500,
  created_at timestamptz not null default now()
);

comment on table public.requeridos_catalogo is
  'Os requeridos, com nome de tela unico. A coluna processos.requeridos guarda as chaves daqui.';

alter table public.requeridos_catalogo enable row level security;

drop policy if exists "requeridos_catalogo_ler" on public.requeridos_catalogo;
create policy "requeridos_catalogo_ler" on public.requeridos_catalogo
  for select to authenticated using (true);

drop policy if exists "requeridos_catalogo_escrever" on public.requeridos_catalogo;
create policy "requeridos_catalogo_escrever" on public.requeridos_catalogo
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ── 2. as colunas no processo ───────────────────────────────────────────────
--
-- PLURAL, e isso não é preciosismo: quatro processos têm litisconsórcio de
-- verdade — ESTADO DO AMAZONAS + DETRAN, IMMU + a locadora, INSTITUTO
-- PRO-SAÚDE + CENUSA, BANCO MASTER + AVANCARD. `contratos.reus` já é array
-- pelo mesmo motivo. Um campo singular obrigaria a escolher um dos dois réus
-- de uma ação que tem os dois.
alter table public.processos
  add column if not exists requeridos text[],
  /* DE ONDE VEIO A RESPOSTA. Daqui a seis meses "por que este processo é do
     Bradesco?" precisa ter resposta — e é isto que permite reprocessar só o
     que veio de palpite, sem tocar no que foi conferido à mão. */
  add column if not exists requerido_origem text
    check (requerido_origem is null or requerido_origem in ('djen','intimacao','contrato','manual'));

comment on column public.processos.requeridos is
  'Chaves de requeridos_catalogo. Array porque litisconsorcio existe.';
comment on column public.processos.requerido_origem is
  'djen = distribuicao do tribunal; intimacao = outro padrao de publicacao; contrato; manual.';

create index if not exists ix_processos_requeridos on public.processos using gin (requeridos);

/* `clientes.requerido` NÃO É APAGADO. Ele erra 49 vezes e acerta 160, e é a
   única memória de quem preencheu à mão. Vira legado: a tela para de lê-lo,
   ninguém escreve nele, e ele fica como referência de conferência. */
comment on column public.clientes.requerido is
  'LEGADO. O requerido agora e do PROCESSO (processos.requeridos). Mantido so como historico.';

-- ── 3. canonizar um nome ────────────────────────────────────────────────────
--
-- O tribunal escreve o mesmo réu de várias formas: "BANCO BRADESCO",
-- "BANCO BRADESCO S/A", "BANCO BRADESCO  S/A". São 3 grafias para 272
-- processos. Esta função junta o que é o mesmo.
--
-- ⚠️ O QUE ELA NÃO PODE JUNTAR: `BANCO BRADESCO` e `BRADESCO VIDA E
-- PREVIDÊNCIA` são pessoas jurídicas DIFERENTES, e a distinção sustenta o
-- produto "Vida e Previdência" do Writer. Por isso a regra do Bradesco testa
-- "VIDA" ANTES de testar "BRADESCO" — a ordem aqui é a regra, não estilo.
create or replace function public.fn_requerido_canonico(bruto text)
returns text
language sql
immutable
as $function$
  select case
    when bruto is null or btrim(bruto) = '' then null
    /* Ordem importa: o mais específico primeiro. */
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
    /* AGIBANK: "BANCO AGIBANK" e "AGIBANK" são a mesma instituição escrita de
       dois jeitos — esta é a única fusão de grafia que eu fiz por conta.
       C6 e PicPay ficaram SEPARADOS de propósito: "C6 CONSIGNADO (Banco FICSA)"
       e as três PicPay são CNPJs distintos, e juntar apagaria uma distinção
       que o processo pode precisar. */
    when bruto ilike '%AGIBANK%'                                        then 'Agibank'
    when bruto ilike '%UNINORTE%' or bruto ilike '%CENESUP%'            then 'UniNorte (CENESUP)'
    when bruto ilike '%AVANCARD%' or bruto ilike '%PROVER PROMO%'       then 'Avancard (Prover)'
    else btrim(regexp_replace(
           regexp_replace(btrim(bruto), '\s*[-–]\s*$', ''),
           '\s+', ' ', 'g'))
  end;
$function$;

comment on function public.fn_requerido_canonico(text) is
  'Junta as grafias do mesmo requerido. NAO junta Banco Bradesco com Bradesco Vida e Previdencia: sao PJs distintas.';

-- ── 4. a chave a partir do nome ─────────────────────────────────────────────
create or replace function public.fn_requerido_chave(nome text)
returns text
language sql
immutable
as $function$
  select nullif(substr(btrim(regexp_replace(
    regexp_replace(
      upper(translate(coalesce(nome,''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')),
      '[^A-Z0-9]+', '_', 'g'),
    '^_+|_+$', '', 'g')), 1, 60), '');
$function$;

-- ── 5. os réus que o tribunal deu, para um número de processo ───────────────
--
-- Função, e não script de uma vez: processo novo passa a nascer preenchido
-- quando a distribuição dele publicar (ver o gatilho no fim). Um preenchimento
-- que só acontece uma vez volta a envelhecer no dia seguinte.
create or replace function public.fn_reus_do_djen(p_numero text)
returns text[]
language sql
stable
as $function$
  with limpo as (
    select replace(replace(regexp_replace(pu.conteudo, '<[^>]*>', ' ', 'g'),
                           'Advogado(a):', '|'), 'ADVOGADO(A):', '|') t
      from public.publicacoes pu
     where regexp_replace(pu.numero_processo, '\D', '', 'g')
         = regexp_replace(coalesce(p_numero,''), '\D', '', 'g')
       /* Só a distribuição: é a única com Apelante/Apelado em campo fixo. */
       and pu.conteudo ilike '%foi distribu%'
  ),
  achado as (
    select btrim(regexp_replace((regexp_matches(t, 'Apelado:\s*([^|]+)', 'g'))[1], '\s+', ' ', 'g')) bruto
      from limpo
  )
  select array_agg(distinct public.fn_requerido_canonico(bruto))
    from achado
   where bruto is not null
     and length(bruto) > 2
     and bruto not ilike '%MINISTERIO PUBLICO%'
     and bruto not ilike '%MINISTÉRIO PÚBLICO%';
$function$;

comment on function public.fn_reus_do_djen(text) is
  'Os requeridos que a publicacao de distribuicao do DJEN nomeia. Ministerio Publico fica de fora: e fiscal da lei.';

-- ── 6. preencher ────────────────────────────────────────────────────────────

-- 6a. o que o tribunal respondeu (406)
update public.processos p
   set requeridos = r.reus, requerido_origem = 'djen'
  from (select id, public.fn_reus_do_djen(numero_processo) reus from public.processos) r
 where r.id = p.id and r.reus is not null and array_length(r.reus,1) > 0;

-- 6b. o que a INTIMAÇÃO respondeu, só para quem ficou sem distribuição.
--
-- Dois padrões, de foros diferentes: `RECLAMADO:` da Justiça do Trabalho (é
-- assim que a LAURA vira HAPVIDA) e o "Para advogados/curador/defensor de X"
-- das intimações cíveis.
--
-- ⚠️ A GUARDA CONTRA PEGAR O PRÓPRIO CLIENTE. O segundo padrão intima os
-- advogados de QUALQUER parte, inclusive a nossa: em ANTONIA MARIA FERREIRA a
-- extração devolveu o nome dela mesma, e em MARIA DO PERPÉTUO devolveu as duas
-- coisas — o Bradesco e ela.
--
-- A guarda compara palavras de CINCO letras ou mais do nome do cliente. A
-- primeira versão usava a primeira palavra, e isso quebrou em "R M DA COSTA
-- REFEIÇÕES": a primeira palavra é "R", que casa com quase qualquer texto, e o
-- réu legítimo (Frangão Restaurante) foi descartado como se fosse o cliente.
-- Palavra curta não identifica ninguém.
update public.processos p
   set requeridos = f.reus, requerido_origem = 'intimacao'
  from (
    with cand as (
      select pr.id, cl.nome cliente,
        coalesce(
          (regexp_match(s.txt,'RECLAMAD[OA]:\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^:]{3,60}?)\s+INTIMA'))[1],
          (regexp_match(s.txt,'defensor de ([^.]{3,55}?) com prazo'))[1]) reu
      from public.processos pr
      join public.clientes cl on cl.id = pr.cliente_id
      join lateral (
        select regexp_replace(regexp_replace(pu.conteudo,'<[^>]*>',' ','g'),'\s+',' ','g') txt
          from public.publicacoes pu
         where regexp_replace(pu.numero_processo,'\D','','g')
             = regexp_replace(pr.numero_processo,'\D','','g')
      ) s on true
      where pr.requeridos is null
    )
    select id, array_agg(distinct public.fn_requerido_canonico(reu)) reus
      from cand
     where reu is not null
       and not exists (
         select 1 from unnest(string_to_array(
                 upper(translate(cliente,'ÁÀÂÃÉÊÍÓÔÕÚÜÇ','AAAAEEIOOOUUC')),' ')) w
          where length(w) >= 5
            and upper(translate(reu,'ÁÀÂÃÉÊÍÓÔÕÚÜÇ','AAAAEEIOOOUUC')) like '%'||w||'%')
     group by id
  ) f
 where f.id = p.id;

-- 6c. herança do CONTRATO, e só sob trava.
--
-- O contrato guarda os réus daquele cliente. Copiar isso para um processo é
-- seguro apenas quando o cliente não tem réus diferentes entre si — KELVIN tem
-- contrato dizendo RAL EMPREENDIMENTOS e processos contra CARDIF, PORTO SEGURO
-- e METLIFE; herdar ali teria posto o réu errado em três ações.
--
-- A trava: só herda se TODO processo daquele cliente que o tribunal já
-- respondeu apontar para o mesmo réu único.
update public.processos p
   set requeridos = array(select public.fn_requerido_canonico(u) from unnest(ct.reus) u),
       requerido_origem = 'contrato'
  from public.contratos ct
 where ct.cliente_id = p.cliente_id
   and ct.reus is not null and array_length(ct.reus,1) > 0
   and p.requeridos is null
   and not exists (
     select 1 from public.processos o
      where o.cliente_id = p.cliente_id
        and o.requerido_origem = 'djen'
        and (array_length(o.requeridos,1) > 1
             or o.requeridos[1] is distinct from public.fn_requerido_canonico(ct.reus[1]))
   );

-- 6d. o catálogo nasce do que foi preenchido — nada de lista digitada à mão
--     que discorda dos dados no dia seguinte.
insert into public.requeridos_catalogo (chave, nome)
select distinct public.fn_requerido_chave(r), r
  from public.processos p, unnest(p.requeridos) r
 where r is not null
on conflict (chave) do nothing;

-- 6e. e as chaves substituem os nomes na coluna do processo.
update public.processos p
   set requeridos = array(select public.fn_requerido_chave(u) from unnest(p.requeridos) u)
 where p.requeridos is not null;

-- ── 7. processo novo já nasce preenchido ────────────────────────────────────
--
-- A distribuição costuma publicar DEPOIS de o processo entrar no sistema. Sem
-- isto, todo processo protocolado de hoje em diante nasceria sem réu e
-- dependeria de alguém lembrar de voltar — que é exatamente como o campo
-- antigo chegou a 49% de vazio.
--
-- Só preenche o que está VAZIO: quem foi conferido à mão (`manual`) não é
-- sobrescrito por robô.
create or replace function public.fn_requerido_ao_publicar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reus text[];
begin
  if new.conteudo is null or new.conteudo not ilike '%foi distribu%' then return new; end if;

  v_reus := public.fn_reus_do_djen(new.numero_processo);
  if v_reus is null or array_length(v_reus,1) = 0 then return new; end if;

  update public.processos p
     set requeridos = array(select public.fn_requerido_chave(u) from unnest(v_reus) u),
         requerido_origem = 'djen'
   where regexp_replace(p.numero_processo,'\D','','g')
       = regexp_replace(new.numero_processo,'\D','','g')
     and p.requeridos is null;

  insert into public.requeridos_catalogo (chave, nome)
  select distinct public.fn_requerido_chave(u), u from unnest(v_reus) u
  on conflict (chave) do nothing;

  return new;
end $function$;

drop trigger if exists trg_requerido_ao_publicar on public.publicacoes;
create trigger trg_requerido_ao_publicar
  after insert on public.publicacoes
  for each row execute function public.fn_requerido_ao_publicar();
