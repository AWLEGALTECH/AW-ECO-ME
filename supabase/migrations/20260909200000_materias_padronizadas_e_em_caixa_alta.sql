-- TODA MATÉRIA PASSA A TER UM NOME SÓ, E EM CAIXA ALTA.
--
-- O Bradesco já tinha virado nome de produto do Writer. Fora dele sobraram 55
-- grafias para 145 processos, com o mesmo tipo de duplicata de sempre:
--
--     TAXA DE ESGOTO           e  FORNECIMENTO DE AGUA        são saneamento
--     ALIMENTO CONTAMINADO     e  PRODUTO VENCIDO             são produto impróprio
--     DANOS PATRIMONIAIS       e  PERDAS E DANOS              são perdas e danos
--     REFINANCIAMENTO INDEVIDO,  REFINANCIAMENTO  e
--       "ESPECÍFICA: FRAUDE REFINANCIAMENTO"                  são a mesma ação
--     BLOOQUEIO DE CONTA       é  bloqueio de conta com erro de digitação
--     "ESPECÍFICA: Seguro GOV" (15), "ESPECÍFICA: SEGURO GOV" (2)
--       e "ESPECÍFICA: SERUGO GOV" (1)                        são 18 do mesmo
--
-- Isso é possível porque nenhum processo fora do Bradesco tem mais de uma
-- rubrica (conferido: zero). Cada um tem exatamente uma, ou nenhuma, então o
-- rótulo do catálogo já é o nome certo e não há combinação a resolver.
--
-- ⚠️ VÁRIAS "ESPECÍFICA: X" NÃO SÃO ESPECÍFICAS. Elas já tinham rubrica de
-- verdade: "ESPECÍFICA: Seguro GOV" tem SEGURO_GOV, "ESPECÍFICA: TARIFA MSG"
-- tem TARIFA_SMS, "ESPECÍFICA: PACOTE DE SERVIÇOS E AD DEPOSITANTE" tem CESTA.
-- O prefixo dizia "não há modelo no Writer para isto", que é uma informação
-- sobre o Writer, não sobre a ação. Ela sai do nome; quem responde se existe
-- modelo é `fn_produto_writer`, e a resposta continua sendo não.

-- ── 1. a rubrica SEGURO estava fazendo dois trabalhos ───────────────────────
--
-- Treze processos são seguro genérico (Agibank, Carrefour, Yamaha, Facta,
-- PicPay, POUPEX, Too Seguros). Outros SETE são especificamente o cartão
-- protegido: os cinco do Bradesco chamados "SEGURO CARTÃO", o "SEGURO CARTÂO"
-- do Itaú e o "SEGURO CREDITO PROTEGIDO" do Banco do Brasil.
--
-- Foi essa ambiguidade que me obrigou, na padronização do Bradesco, a mapear
-- `SEGURO -> Seguro Cartão Protegido` na marra. Consertar a rubrica é melhor
-- que carregar o contorno: o produto existe no Writer e merece chave própria.
insert into public.materias_catalogo (chave, rotulo, familia, ordem)
values ('SEGURO_CARTAO_PROTEGIDO', 'Seguro cartão protegido', 'bancaria', 65)
on conflict (chave) do nothing;

update public.processos
   set materia_rubricas = array_replace(materia_rubricas, 'SEGURO', 'SEGURO_CARTAO_PROTEGIDO')
 where 'SEGURO' = any(materia_rubricas)
   and (materia ilike '%cartão protegido%' or materia ilike '%cartao protegido%'
     or materia ilike '%credito protegido%' or materia ilike '%crédito protegido%'
     or materia ilike 'seguro cart_o');

-- ── 2. o Writer conhece a chave nova, e devolve em caixa alta ───────────────
--
-- Duas mudanças na mesma função. A chave nova entra no lugar do contorno, e o
-- `SEGURO` genérico SAI do mapa: ele não é produto nenhum, e deixá-lo apontando
-- para o cartão protegido faria os treze seguros genéricos herdarem um produto
-- que não é o deles no dia em que algum virasse Bradesco.
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
    ('DÉBITOS AUTOMÁTICOS','GASTO_C_CRED'),
    ('DÉBITOS AUTOMÁTICOS','PARC_CRED_PESS'),
    ('DÉBITOS AUTOMÁTICOS','BX_ANT_FIN'),
    ('TARIFAS BANCÁRIAS','SAQUE_TERMINAL'),
    ('TARIFAS BANCÁRIAS','EMISSAO_EXTRATO'),
    ('TARIFAS BANCÁRIAS','EXTRATO_MOVIMENTO'),
    ('JUROS E ENCARGOS INDEVIDOS','MORA'),
    ('JUROS E ENCARGOS INDEVIDOS','MORA_C_CREDITO'),
    ('JUROS E ENCARGOS INDEVIDOS','ENCARGOS_EXCESSO'),
    ('JUROS E ENCARGOS INDEVIDOS','ENCARGOS_DESCOBERTOS'),
    ('SEGURO PRESTAMISTA','SEGURO_PRESTAMISTA'),
    ('VIDA E PREVIDÊNCIA','VIDA_PREV'),
    ('TÍTULO DE CAPITALIZAÇÃO','TIT_CAP'),
    ('CESTA DE SERVIÇOS','CESTA'),
    ('ANUIDADE CARTÃO','ANUIDADE'),
    ('DÍVIDA EM ATRASO','DIV_ATRASO'),
    ('SEGURO CARTÃO PROTEGIDO','SEGURO_CARTAO_PROTEGIDO')
  )
  select array_agg(distinct m.produto),
         (select count(*) from unnest(p_rubricas) x
           where not exists (select 1 from mapa m2 where m2.chave = x))
    into v_produtos, v_sem_produto
    from mapa m where m.chave = any(p_rubricas);

  if v_sem_produto > 0 then return null; end if;
  if v_produtos is null then return null; end if;
  if array_length(v_produtos, 1) > 1 then return 'MIX BRADESCO'; end if;
  return v_produtos[1];
end $function$;

-- ── 3. o Bradesco reaplica, agora com a chave certa e em caixa alta ─────────
update public.processos p
   set materia = public.fn_produto_writer(p.materia_rubricas)
 where public.fn_produto_writer(p.materia_rubricas) is not null
   and exists (select 1 from unnest(p.requeridos) k
                join public.requeridos_catalogo rc on rc.chave = k
               where rc.nome = 'BANCO BRADESCO');

-- ── 4. fora do Bradesco, o nome é o rótulo do catálogo ─────────────────────
--
-- Vale para rubrica única que não seja ESPECÍFICA, que é o caso de todos.
-- É esta linha que junta TAXA DE ESGOTO com FORNECIMENTO DE AGUA, e as três
-- grafias de Seguro GOV.
update public.processos p
   set materia = upper(mc.rotulo)
  from public.materias_catalogo mc
 where array_length(p.materia_rubricas, 1) = 1
   and mc.chave = p.materia_rubricas[1]
   and p.materia_rubricas[1] <> 'ESPECIFICA'
   and public.fn_produto_writer(p.materia_rubricas) is null;

-- ── 5. a ESPECÍFICA de verdade fica, com acento e sem duplicata ─────────────
--
-- "ESPECIFICA" sem acento e "ESPECÍFICA" com acento eram dois nomes para a
-- mesma ausência de matéria. E o que vem depois dos dois-pontos é a única
-- memória da tese naqueles processos, então continua no nome.
update public.processos
   set materia = 'ESPECÍFICA'
 where 'ESPECIFICA' = any(materia_rubricas)
   and upper(translate(coalesce(materia,''),'ÍI','II')) in ('ESPECIFICA','');

-- ── 6. caixa alta em tudo ───────────────────────────────────────────────────
update public.processos set materia = upper(materia) where materia is distinct from upper(materia);

-- ── 7. a trava ──────────────────────────────────────────────────────────────
--
-- Gatilho, e não CHECK: um CHECK recusaria o que a pessoa digitou na ficha e
-- devolveria um erro de banco na cara dela. O gatilho aceita "cesta de
-- tarifas" e grava "CESTA DE TARIFAS", que é o que ela queria dizer. A regra
-- vale para todo caminho de escrita, inclusive os que ainda não existem.
create or replace function public.fn_materia_em_caixa_alta()
returns trigger
language plpgsql
as $function$
begin
  if new.materia is not null then
    new.materia := upper(btrim(regexp_replace(new.materia, '\s+', ' ', 'g')));
    if new.materia = '' then new.materia := null; end if;
  end if;
  return new;
end $function$;

drop trigger if exists trg_materia_em_caixa_alta on public.processos;
create trigger trg_materia_em_caixa_alta
  before insert or update of materia on public.processos
  for each row execute function public.fn_materia_em_caixa_alta();
