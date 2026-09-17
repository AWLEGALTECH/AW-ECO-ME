-- A COPY DO SINO, PARA CHAMADO ABERTO E CHAMADO RESOLVIDO.
--
-- O que estava escrito começava pela categoria e terminava no assunto:
--   "Novo chamado (Bug) em Outros: MELHORIAS NO TRACKER. Aberto por Luan."
-- As três primeiras palavras são as mesmas em toda notificação de chamado, e
-- no sino a linha chega cortada. Quem batia o olho lia "Novo chamado (Bug) em
-- Outr..." e tinha que abrir para descobrir do que se tratava.
--
-- Agora o assunto vem primeiro, que é a única parte que muda de um chamado
-- para o outro, e o nome de quem fez vai sempre no fim:
--   "MELHORIAS NO TRACKER. Bug em Outros, aberto por Luan."
--   "CRIAR FLUXO REAJUIZAMENTO, em Processos. Resolvido por Luan."
--
-- Três decisões que valem explicação:
--
-- 1. NOME CURTO. "Luan", não "Luan Asaf Oliveira". É gente da casa falando de
--    gente da casa, e o sobrenome só empurra o assunto para fora da linha.
--    Vale daqui para frente: as notificações já gravadas guardam o texto
--    pronto e continuam como estavam.
--
-- 2. O TIPO SAI DO FECHAMENTO. Na abertura ele serve para triagem (quem lê
--    decide se é com ele). Depois de resolvido não muda mais nada, e ocupa
--    espaço que o assunto usa melhor.
--
-- 3. A RESOLUÇÃO VIRA PÚBLICA. Antes ia só para quem abriu o chamado
--    (`destinatario_id` = autor). Foi pedido que todo mundo receba, para a
--    equipe ver o que anda sendo entregue. Passa a ser `null`, que é como o
--    resto da casa marca notificação para todos.
--
-- O emoji do fechamento deixa de ser ✅ e vira 🛠️, que é o par de 🎫: um
-- abre o chamado, o outro é o que foi feito nele. O ✅ é o mesmo emoji que a
-- casa usa para tarefa concluída, prazo cumprido e demanda fechada, e no meio
-- da lista os três viravam a mesma coisa.

-- ── o rótulo do tipo, num lugar só ──────────────────────────────────────────
-- Os dois gatilhos traduziam `tipo` por conta própria, e as listas já tinham
-- divergido: o de abertura conhecia 'melhoria', o de fechamento não, e quem
-- resolvesse uma melhoria recebia a palavra crua, em minúscula. Regra repetida
-- em dois lugares é regra que diverge em um.
create or replace function public.fn_rotulo_tipo_chamado(p text)
returns text language sql immutable as $$
  select case lower(btrim(coalesce(p, '')))
           when 'bug'           then 'Bug'
           when 'melhoria'      then 'Melhoria'
           when 'implementacao' then 'Implementação'
           when 'ideia'         then 'Ideia'
           when 'duvida'        then 'Dúvida'
           when 'outro'         then 'Outro'
           else public.fn_title_nome(p)
         end;
$$;

comment on function public.fn_rotulo_tipo_chamado(text) is
  'O tipo do chamado como a pessoa lê. Usado pelos gatilhos de notificação.';

-- ── os moldes que o sino usa de verdade ─────────────────────────────────────
-- `fn_criar_notificacao_ext` prefere o template daqui e só cai no texto do
-- gatilho se este vier vazio. Os dois mudam juntos, sempre.
update public.notificacao_config
   set titulo_template = 'Novo chamado 🎫',
       corpo_template  = '{titulo}. {tipo} em {sistema}, aberto por {autor}.'
 where tipo = 'chamado_aberto';

update public.notificacao_config
   set titulo_template = 'Chamado resolvido 🛠️',
       corpo_template  = '{titulo}, em {sistema}. Resolvido por {resolvido_por}.'
 where tipo = 'chamado_resolvido';

-- ── abertura ────────────────────────────────────────────────────────────────
create or replace function public.fn_notif_chamado_aberto()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_tl text; v_sis text; v_tit text; v_quem text;
begin
  v_tl  := public.fn_rotulo_tipo_chamado(new.tipo);
  v_sis := coalesce(nullif(btrim(new.sistema), ''), 'Geral');
  -- O assunto agora é seguido de ponto no texto. Metade dos chamados é
  -- digitada com ponto final e a outra metade não, e sem isto sairia "..".
  v_tit := rtrim(btrim(coalesce(new.titulo, '')), ' .');
  v_quem := coalesce(nullif(public.fn_primeiro_nome(new.autor_nome), ''), 'alguém');

  perform public.fn_criar_notificacao(
    'chamado_aberto', 'Novo chamado 🎫',
    v_tit || '. ' || v_tl || ' em ' || v_sis || ', aberto por ' || v_quem || '.',
    jsonb_build_object('titulo', v_tit, 'tipo', v_tl, 'sistema', v_sis,
                       'autor', v_quem),
    '/chamados', new.created_by, new.autor_nome);
  return new;
end; $function$;

-- ── fechamento ──────────────────────────────────────────────────────────────
create or replace function public.fn_notif_chamado_resolvido()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_tl text; v_sis text; v_tit text; v_quem text;
begin
  if new.status <> 'resolvido' or old.status is not distinct from 'resolvido' then
    return new;
  end if;

  v_tl  := public.fn_rotulo_tipo_chamado(new.tipo);
  v_sis := coalesce(nullif(btrim(new.sistema), ''), 'Geral');
  v_tit := rtrim(btrim(coalesce(new.titulo, '')), ' .');
  -- Sem nome, "Resolvido por a equipe" sairia torto. "alguém da equipe" cai
  -- na mesma frase sem precisar de uma segunda redação.
  v_quem := coalesce(nullif(public.fn_primeiro_nome(new.resolvido_por_nome), ''), 'alguém da equipe');

  perform public.fn_criar_notificacao_ext(
    'chamado_resolvido', 'Chamado resolvido 🛠️',
    v_tit || ', em ' || v_sis || '. Resolvido por ' || v_quem || '.',
    jsonb_build_object('titulo', v_tit, 'tipo', v_tl, 'sistema', v_sis,
                       'resolvido_por', v_quem,
                       'autor', coalesce(nullif(public.fn_primeiro_nome(new.autor_nome), ''), 'alguém')),
    '/chamados', new.resolvido_por, new.resolvido_por_nome,
    -- null = todo mundo recebe. Era `new.created_by`, que mandava só para quem
    -- abriu. Ver a decisão 3 no cabeçalho.
    null);
  return new;
end; $function$;
