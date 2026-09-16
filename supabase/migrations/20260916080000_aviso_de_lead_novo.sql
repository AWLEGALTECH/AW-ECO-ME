-- ═══════════════════════════════════════════════════════════════════════════
-- AVISO DE LEAD NOVO NA BASE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A notificação é a MESMA do resto do AW: mesma tabela, mesma função, mesmo
-- sino. Não é um canal novo — é mais um tipo no registro que já existe, com
-- template editável na administração como o balanço comercial e o pré-cliente.
-- Um segundo mecanismo de aviso seria o jeito conhecido de os dois divergirem.
--
-- ─────────────────────────── a trava que ela exige ──────────────────────────
--
-- LIGAR O AVISO NUMA BASE QUE JÁ TEM 708 LINHAS NÃO PODE GERAR 708 AVISOS, e
-- geraria: o gatilho dispara por linha, e nada nele sabe que aquelas linhas
-- são velhas. Pior, a primeira leitura de uma base recém-ligada insere a
-- planilha inteira de uma vez.
--
-- Então o interruptor grava QUANDO foi ligado (`notificar_desde`), e só avisa
-- de quem chegou depois disso. É a mesma trava do `ligada_em` das automações,
-- pelo mesmo motivo e com a mesma regra: quem já estava não conta.

alter table public.leads_fontes
  add column if not exists notificar boolean not null default false,
  add column if not exists notificar_desde timestamptz;

comment on column public.leads_fontes.notificar is
  'Avisar no sino do AW quando um lead novo entrar nesta base.';
comment on column public.leads_fontes.notificar_desde is
  'Quando o aviso foi ligado. Lead anterior a isto não gera aviso, senão ligar numa base cheia despejaria uma notificação por linha.';

-- O interruptor carimba a data sozinho: trava que o cliente preenche não é
-- trava, e deixar isso para a tela significaria uma tela que esquece.
create or replace function public.fn_leads_fonte_notificar_carimbo()
returns trigger
language plpgsql
as $$
begin
  if new.notificar and not coalesce(old.notificar, false) then
    new.notificar_desde := now();
  elsif not new.notificar then
    new.notificar_desde := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_leads_fonte_notificar on public.leads_fontes;
create trigger trg_leads_fonte_notificar
  before update of notificar on public.leads_fontes
  for each row execute function public.fn_leads_fonte_notificar_carimbo();

-- ── o tipo, no registro que a administração já edita ───────────────────────
-- `visivel_usuarios` é true: o pedido é que a equipe inteira saiba que chegou
-- gente, e não só quem administra.
insert into public.notificacao_config (tipo, label, ativo, visivel_usuarios, titulo_template, corpo_template, variaveis)
values (
  'lead_novo_na_base',
  'Lead novo na base',
  true,
  true,
  'Lead novo 📩',
  '{lead} acabou de se cadastrar em {base}.',
  jsonb_build_object(
    'lead', 'Nome de quem se cadastrou',
    'base', 'Nome da base (a planilha ligada)',
    'numero', 'Número do WhatsApp em que a base está ligada')
)
on conflict (tipo) do update set
  label            = excluded.label,
  titulo_template  = excluded.titulo_template,
  corpo_template   = excluded.corpo_template,
  variaveis        = excluded.variaveis;

-- ── o gatilho ──────────────────────────────────────────────────────────────
-- SÓ NO INSERT. O lead que volta (a leitura da planilha reescreve a linha
-- quando o conteúdo muda) não é lead novo, e avisar de novo seria o tipo de
-- ruído que faz a equipe parar de olhar o sino.
create or replace function public.fn_notif_lead_novo_na_base()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  f record;
  v_nome text;
begin
  select nome, instancia, notificar, notificar_desde
    into f
    from public.leads_fontes
   where id = new.fonte_id;

  if f.nome is null or not coalesce(f.notificar, false) then return new; end if;

  -- quem já estava na base quando o aviso foi ligado não conta
  if f.notificar_desde is not null
     and coalesce(new.chegou_em, now()) < f.notificar_desde then
    return new;
  end if;

  /* Sem nome, o telefone. Um aviso dizendo "acabou de se cadastrar" sem dizer
     quem é um aviso que obriga a abrir o sistema para descobrir do que ele
     falava. `fn_title_nome` deixa "JOSE MARIO" virar "Jose Mario", que é o
     mesmo tratamento que o pré-cliente dá. */
  v_nome := coalesce(
    nullif(public.fn_title_nome(nullif(btrim(new.nome), '')), ''),
    nullif(btrim(new.telefone), ''),
    'alguém');

  perform public.fn_criar_notificacao(
    'lead_novo_na_base',
    'Lead novo 📩',
    v_nome || ' acabou de se cadastrar em ' || f.nome || '.',
    jsonb_build_object(
      'lead', v_nome,
      'base', f.nome,
      'numero', f.instancia,
      'fonte_id', new.fonte_id,
      'lead_id', new.id),
    '/atendimento',
    null,
    null);

  return new;
end $$;

drop trigger if exists trg_notif_lead_novo on public.leads_brutos;
create trigger trg_notif_lead_novo
  after insert on public.leads_brutos
  for each row execute function public.fn_notif_lead_novo_na_base();
