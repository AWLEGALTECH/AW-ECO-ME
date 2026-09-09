-- A RUBRICA DEIXA DE SER DERIVADA DO NOME. O SENTIDO SE INVERTEU.
--
-- `trg_processos_classificar_materia` recalculava `materia_rubricas` a partir do
-- TEXTO da matéria a cada escrita. Isso fazia sentido enquanto a matéria era
-- texto livre copiado da planilha: dava pra ler "SAQUE TERMINAL/EMISSÃO EXTRATO"
-- e adivinhar as rubricas.
--
-- A padronização inverteu a relação. Agora a matéria é o NOME DO PRODUTO
-- ("DÉBITOS AUTOMÁTICOS") e a rubrica é a fonte, não o derivado. O gatilho
-- continuou tentando ler rubrica do nome, não achou palavra-chave nenhuma em
-- "DÉBITOS AUTOMÁTICOS", e gravou vazio.
--
-- ESTRAGO MEDIDO: 120 processos ficaram sem rubrica (eram 2) e 205 tiveram a
-- lista alterada. Na ficha apareceu como o nome do produto sozinho, sem as
-- linhas embaixo dizendo o que ele cobra.
--
-- Eu não olhei os gatilhos da tabela antes de escrever os UPDATEs. Ele estava
-- lá desde antes, fazia o trabalho certo para o desenho antigo, e foi a mudança
-- de desenho que o transformou em destruidor. `processos_materia_bkp_20260909`
-- é o que permitiu desfazer, e é exatamente por isso que ele existe.

create or replace function public.fn_processos_classificar_materia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  /* Processo novo, digitado à mão com texto livre, continua ganhando rubrica
     pela leitura do texto. Processo que JÁ tem rubrica nunca mais é
     sobrescrito por uma releitura do nome: quem sabe as rubricas é a coluna,
     não a string. */
  if new.materia_rubricas is null or cardinality(new.materia_rubricas) = 0 then
    new.materia_rubricas := public.fn_rubricas_da_materia(new.materia);
  end if;

  select c.familia into new.materia_familia
    from public.materias_catalogo c
   where c.chave = any(new.materia_rubricas)
   order by c.ordem limit 1;

  return new;
end;
$function$;

comment on function public.fn_processos_classificar_materia is
  'Classifica a materia SO quando as rubricas estao vazias. Depois da padronizacao a rubrica e a fonte, e o nome e o derivado.';

-- Desfazer. As rubricas primeiro: como este UPDATE não toca em `materia`, o
-- gatilho (que é `update of materia`) nem chega a rodar.
update public.processos p
   set materia_rubricas = b.materia_rubricas
  from public.processos_materia_bkp_20260909 b
 where b.id = p.id and p.materia_rubricas is distinct from b.materia_rubricas;

-- E os nomes. Agora seguro: o gatilho corrigido não mexe em rubrica preenchida.
update public.processos p
   set materia = b.materia
  from public.processos_materia_bkp_20260909 b
 where b.id = p.id and p.materia is distinct from b.materia;
