-- TIRAR UM LEAD DA BASE, DE UM JEITO QUE SOBREVIVA AO SYNC.
--
-- Apagar a linha de `leads_brutos` não funciona: a leads-sync roda a cada
-- minuto, faz upsert por (fonte_id, telefone) e a planilha continua com a
-- linha, então o lead volta em sessenta segundos. Foi exatamente o que
-- aconteceu na primeira tentativa de limpar os leads de teste ("não consegui
-- apagar"). Apagar na planilha também não serve: é a planilha de respostas do
-- Forms, e mexer nela à mão é pedir para desalinhar a landing.
--
-- A saída é a LÁPIDE: `apagado_em`. Quem tem lápide some da tela, das contas
-- e das buscas por telefone, mas a linha continua existindo para o sync não a
-- tratar como novidade.
--
-- E a regra que faz a lápide não virar prisão: se a planilha trouxer um
-- `chegou_em` MAIS NOVO que a lápide, a pessoa preencheu o formulário de novo
-- depois de ter sido tirada. Isso é um lead novo, e ele volta como novo, com
-- os gatilhos de "lead novo" disparando. Sem essa regra, tirar o próprio
-- número da base para testar de novo tornaria o teste impossível para sempre.
alter table public.leads_brutos add column if not exists apagado_em timestamptz;

create or replace function public.fn_leads_brutos_lapide()
returns trigger
language plpgsql
as $function$
begin
  -- Linha viva: nada a decidir.
  if old.apagado_em is null then return new; end if;

  -- Alguém mexeu NA LÁPIDE de propósito (apagar de novo, restaurar): passa.
  -- O sync nunca envia `apagado_em`, então nele NEW herda OLD e cai abaixo.
  if new.apagado_em is distinct from old.apagado_em then return new; end if;

  -- Preenchimento novo depois do apagamento: volta como lead novo, limpo. O
  -- que ele tinha de conversa e abordagem era da vida anterior dele.
  if new.chegou_em is not null and new.chegou_em > old.apagado_em then
    new.apagado_em  := null;
    new.situacao    := 'novo';
    new.conversa_id := null;
    new.abordado_em := null;
    new.abordado_por := null;
    return new;
  end if;

  -- O sync regravando o que já estava lá: o apagado continua apagado. Devolver
  -- null pula o update E os gatilhos AFTER, então nem notificação nem automação
  -- acordam por causa de uma linha que ninguém quer ver.
  return null;
end
$function$;

-- BEFORE roda em ordem alfabética: "lapide" vem antes de "updated", então a
-- lápide decide antes de o carimbo de updated_at ser tocado.
drop trigger if exists trg_leads_brutos_lapide on public.leads_brutos;
create trigger trg_leads_brutos_lapide
  before update on public.leads_brutos
  for each row execute function public.fn_leads_brutos_lapide();

-- ── quem lê a base passa a não ver o apagado ────────────────────────────────

create or replace function public.fn_leads_da_base(p_fonte uuid)
returns table(
  id uuid, fonte_id uuid, telefone text, nome text, cidade text, respostas text,
  origem_texto text, chegou_em timestamptz, linha integer, situacao text,
  conversa_id uuid, bruto jsonb, escreveu boolean, tem_conversa boolean,
  conversa_instancia text, conversa_achada uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select b.id, b.fonte_id, b.telefone, b.nome, b.cidade, b.respostas, b.origem_texto,
         b.chegou_em, b.linha, b.situacao, b.conversa_id, b.bruto,
         coalesce(x.escreveu, false) as escreveu,
         x.conversa is not null      as tem_conversa,
         x.instancia                 as conversa_instancia,
         x.conversa                  as conversa_achada
    from public.leads_brutos b
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
     and b.apagado_em is null
   order by b.chegou_em desc nulls last;
$function$;

create or replace function public.fn_leads_resumo(p_desde timestamptz default null)
returns table(fonte_id uuid, total bigint, novos bigint, antigos bigint, no_periodo bigint)
language sql
stable
as $function$
  select
    f.id,
    count(*) filter (where b.situacao <> 'descartado'),
    count(*) filter (
      where b.situacao = 'novo'
        and (f.novos_desde is null or b.chegou_em is null or b.chegou_em >= f.novos_desde)
    ),
    count(*) filter (
      where b.situacao = 'novo'
        and f.novos_desde is not null
        and b.chegou_em is not null
        and b.chegou_em < f.novos_desde
    ),
    count(*) filter (
      where p_desde is not null
        and b.situacao <> 'descartado'
        and b.chegou_em is not null
        and b.chegou_em >= p_desde
    )
  from public.leads_fontes f
  -- O apagado sai da conta no JOIN, e não num WHERE: um WHERE derrubaria a base
  -- inteira do resultado quando todos os leads dela estivessem apagados, e o
  -- cartão dela sumiria em vez de mostrar zero.
  left join public.leads_brutos b on b.fonte_id = f.id and b.apagado_em is null
  group by f.id;
$function$;

-- As buscas por telefone que ligam conversa a lead: o apagado não é mais "o
-- lead deste número". Se ele voltar, a lápide cai e ele volta a ser achado.
create or replace function public.fn_wa_automacao_lead(p_conversa uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    c.lead_bruto_id,
    (select b.id
       from public.leads_brutos b
       join public.leads_fontes f on f.id = b.fonte_id
      where b.telefone = c.telefone
        and b.apagado_em is null
        and lower(f.instancia) = lower(c.instancia)
      order by b.chegou_em desc nulls last
      limit 1))
    from public.wa_conversas c
   where c.id = p_conversa;
$function$;

create or replace function public.fn_wa_vincular_base(p_conversa uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tel  text;
  v_inst text;
  v_lead record;
begin
  select telefone, instancia into v_tel, v_inst
    from public.wa_conversas where id = p_conversa;
  if v_tel is null then return; end if;

  select b.id, b.fonte_id into v_lead
    from public.leads_brutos b
    join public.leads_fontes f on f.id = b.fonte_id
   where b.telefone = v_tel
     and b.apagado_em is null
     and lower(f.instancia) = lower(v_inst)
   order by b.chegou_em desc nulls last
   limit 1;

  if v_lead.id is null then return; end if;

  update public.wa_conversas
     set fonte_id = v_lead.fonte_id, lead_bruto_id = v_lead.id
   where id = p_conversa;

  update public.leads_brutos
     set situacao = 'abordado',
         conversa_id = p_conversa,
         abordado_em = coalesce(abordado_em, now())
   where id = v_lead.id and situacao <> 'abordado';
end
$function$;
