-- ═══════════════════════════════════════════════════════════════════════════
-- A BASE INTEIRA, E QUEM DELA JÁ FALOU CONOSCO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A caixa mostrava, da base, só quem ainda não tinha sido abordado. Era uma
-- FILA DE TRABALHO, e como fila estava certa. Só que a pergunta que se faz
-- olhando uma base não é só "quem falta abordar": é "quem está aqui dentro, e
-- em que pé está cada um". Com metade escondida, 708 linhas viravam 78, e as
-- outras 630 não existiam em lugar nenhum da tela.
--
-- A ETIQUETA "NUNCA ESCREVEU" ERA FIXA NO CÓDIGO, e podia ser: se a lista só
-- trazia quem nunca foi abordado, todos eram isso. Mostrando a base inteira,
-- ela passa a ser uma pergunta de verdade, e a resposta não está em
-- `leads_brutos`: está em haver conversa com mensagem de ENTRADA. E não basta
-- olhar a conversa da instância aberta — o lead pode ter escrito para outro
-- número do escritório, e para quem prospecta isso é a informação mais
-- importante que existe. Então a busca é por telefone, em qualquer instância.
--
-- `situacao = 'abordado'` NÃO RESPONDE ISSO, e é o engano fácil: ela diz que
-- NÓS fomos até a pessoa, não que a pessoa veio até nós.

-- ── o índice que a busca por telefone precisa ──────────────────────────────
-- Existe o único por (instancia, telefone), que não serve para procurar em
-- QUALQUER instância: o primeiro campo do índice não entra na condição. Com
-- 162 conversas a varredura é grátis, e é justamente por isso que ela passaria
-- despercebida até o dia em que não é.
create index if not exists wa_conversas_telefone_idx
  on public.wa_conversas (telefone);

-- ── a base inteira, com o estado de cada lead ──────────────────────────────
create or replace function public.fn_leads_da_base(p_fonte uuid)
returns table (
  id uuid,
  fonte_id uuid,
  telefone text,
  nome text,
  cidade text,
  respostas text,
  origem_texto text,
  chegou_em timestamptz,
  linha int,
  situacao text,
  conversa_id uuid,
  bruto jsonb,
  /** o lead já mandou mensagem para algum número do escritório */
  escreveu boolean,
  /** já existe conversa aberta com ele, tenha ele escrito ou não */
  tem_conversa boolean,
  /** em qual número essa conversa está */
  conversa_instancia text,
  /** o id dela, para o clique levar direto ao lugar certo */
  conversa_achada uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select b.id, b.fonte_id, b.telefone, b.nome, b.cidade, b.respostas, b.origem_texto,
         b.chegou_em, b.linha, b.situacao, b.conversa_id, b.bruto,
         coalesce(x.escreveu, false) as escreveu,
         x.conversa is not null      as tem_conversa,
         x.instancia                 as conversa_instancia,
         x.conversa                  as conversa_achada
    from public.leads_brutos b
    /* Uma conversa por lead, e A QUE MAIS IMPORTA quando há várias: a que tem
       mensagem de entrada ganha de qualquer outra, porque é ela que responde a
       pergunta. Entre as empatadas, a mais recente. */
    left join lateral (
      select c.id as conversa,
             c.instancia,
             exists (select 1 from public.wa_mensagens m
                      where m.conversa_id = c.id and m.direcao = 'entrada') as escreveu
        from public.wa_conversas c
       where c.telefone = b.telefone
       order by exists (select 1 from public.wa_mensagens m
                         where m.conversa_id = c.id and m.direcao = 'entrada') desc,
                c.ultima_em desc nulls last
       limit 1
    ) x on true
   where b.fonte_id = p_fonte
   /* Mais recente primeiro: lead de landing esfria rápido, e quem chegou hoje
      de manhã tem chance muito maior de responder que o de semana passada. */
   order by b.chegou_em desc nulls last;
$$;

revoke execute on function public.fn_leads_da_base(uuid) from public, anon;
grant  execute on function public.fn_leads_da_base(uuid) to authenticated, service_role;

-- ── o contador das duas etiquetas, sem trazer as linhas ────────────────────
-- A tela precisa do número ANTES de o filtro escolher um lado, para escrever
-- "escreveram 12 · nunca escreveram 696" no próprio botão. Contar no navegador
-- exigiria baixar as 708 para saber, o que é o oposto do que um filtro serve.
create or replace function public.fn_base_contagem(p_fonte uuid)
returns table (total bigint, escreveram bigint, nunca bigint, com_conversa bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)                                           as total,
         count(*) filter (where l.escreveu)                 as escreveram,
         count(*) filter (where not l.escreveu)             as nunca,
         count(*) filter (where l.tem_conversa)             as com_conversa
    from public.fn_leads_da_base(p_fonte) l;
$$;

revoke execute on function public.fn_base_contagem(uuid) from public, anon;
grant  execute on function public.fn_base_contagem(uuid) to authenticated, service_role;
