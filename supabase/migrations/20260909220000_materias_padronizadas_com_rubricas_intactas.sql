-- REAPLICAÇÃO DA PADRONIZAÇÃO, AGORA COM AS RUBRICAS PRESERVADAS.
--
-- A tentativa anterior renomeou certo e destruiu as rubricas no caminho, porque
-- o gatilho de classificação as re-derivava do nome novo. Com o gatilho
-- corrigido (ele só classifica o que ainda não tem rubrica), as mesmas regras
-- rodam sem colateral.

-- ── 1. quem é cartão protegido ganha chave própria ─────────────────────────
--
-- A rubrica SEGURO fazia dois trabalhos: treze processos de seguro genérico
-- (Agibank, Carrefour, Yamaha, Facta, PicPay, POUPEX, Too) e sete que são
-- especificamente o cartão protegido. Foi essa ambiguidade que me obrigou, na
-- primeira padronização, a mapear `SEGURO -> Seguro Cartão Protegido` na marra.
--
-- A comparação é por `translate`, e não por ILIKE: acento em MAIÚSCULA não é
-- dobrado de forma confiável pelo ILIKE nesta base, e foi assim que
-- `%cartão protegido%` passou ao largo de "SEGURO CARTÃO" na primeira tentativa.
update public.processos p
   set materia_rubricas = array_replace(p.materia_rubricas, 'SEGURO', 'SEGURO_CARTAO_PROTEGIDO')
  from public.processos_materia_bkp_20260909 b
 where b.id = p.id
   and 'SEGURO' = any(p.materia_rubricas)
   and 'ESPECIFICA' <> all(p.materia_rubricas)
   and upper(translate(coalesce(b.materia,''),
         'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC'))
       in ('SEGURO CARTAO', 'SEGURO CARTÂO', 'SEGURO CREDITO PROTEGIDO');

-- ── 2. Bradesco: o nome é o produto do Writer ──────────────────────────────
update public.processos p
   set materia = public.fn_produto_writer(p.materia_rubricas)
 where public.fn_produto_writer(p.materia_rubricas) is not null
   and exists (select 1 from unnest(p.requeridos) k
                join public.requeridos_catalogo rc on rc.chave = k
               where rc.nome = 'BANCO BRADESCO');

-- ── 3. o resto de rubrica única: o rótulo do catálogo ──────────────────────
--
-- Cobre o Bradesco sem produto (RCC, RMC, operações vencidas, reorganização
-- financeira, bloqueio de conta, seguro veicular, mora de operações) e TODO o
-- não-Bradesco. Fora do Bradesco não se usa nome de produto de propósito: os
-- produtos são peças do Bradesco, e uma cesta do Banco do Brasil chamada
-- "CESTA DE SERVIÇOS" sugeriria um modelo pronto que não existe pra ela.
update public.processos p
   set materia = upper(mc.rotulo)
  from public.materias_catalogo mc
 where array_length(p.materia_rubricas, 1) = 1
   and mc.chave = p.materia_rubricas[1]
   and p.materia_rubricas[1] <> 'ESPECIFICA'
   and public.fn_produto_writer(p.materia_rubricas) is distinct from p.materia;

-- ── 4. a ESPECÍFICA mantém a tese e perde o travessão ──────────────────────
update public.processos
   set materia = case
     when btrim(regexp_replace(materia, '^\s*ESPEC[ÍI]FICA\s*[-—–:]*\s*', '', 'i')) = ''
       then 'ESPECÍFICA'
     else 'ESPECÍFICA: ' || btrim(regexp_replace(materia, '^\s*ESPEC[ÍI]FICA\s*[-—–:]*\s*', '', 'i'))
   end
 where 'ESPECIFICA' = any(materia_rubricas) and materia is not null;

-- ── 5. a família volta a bater com as rubricas ─────────────────────────────
update public.processos p
   set materia_familia = (select c.familia from public.materias_catalogo c
                           where c.chave = any(p.materia_rubricas)
                           order by c.ordem limit 1)
 where p.materia_rubricas is not null;
