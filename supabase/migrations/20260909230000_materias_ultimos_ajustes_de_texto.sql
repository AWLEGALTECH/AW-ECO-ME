-- ÚLTIMOS TRÊS AJUSTES DE TEXTO NAS MATÉRIAS.

-- 1. "SERUGO GOV" é "SEGURO GOV" com as letras trocadas. Era o único motivo de
--    aquele processo não encontrar os outros dezessete iguais a ele.
update public.processos
   set materia = replace(materia, 'SERUGO', 'SEGURO')
 where materia like '%SERUGO%';

-- 2. O hífen sai, pela mesma razão do travessão: é texto que alguém lê. Onde
--    ele separava um complemento, o complemento vira parêntese.
update public.processos
   set materia = btrim(regexp_replace(materia, '\s+-\s+(.+)$', ' (\1)'))
 where materia ~ '\s-\s';

-- 3. E o hífen que sobrar solto vira espaço, sem deixar espaço dobrado.
update public.processos
   set materia = btrim(regexp_replace(replace(materia, '-', ' '), '\s+', ' ', 'g'))
 where materia like '%-%';
