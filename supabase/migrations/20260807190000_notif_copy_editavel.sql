-- Central de notificações: copy EDITÁVEL por tipo + remoção de travessões.
--
-- Antes cada copy era montada em SQL por concatenação, sem jeito de o admin
-- ver/editar o texto. Agora cada tipo tem um TEMPLATE editável em
-- notificacao_config (titulo_template / corpo_template) com variáveis {chave}
-- que são substituídas pelos valores de `dados` no momento do disparo. Se o
-- template estiver vazio, cai no texto default da função. Nenhuma copy sai com
-- travessão "—" (removido no render e na gravação).

-- 1) Colunas de template + dicionário de variáveis por tipo. ────────────────
alter table public.notificacao_config
  add column if not exists titulo_template text,
  add column if not exists corpo_template  text,
  add column if not exists variaveis       jsonb not null default '{}'::jsonb;

-- 2) Renderiza um template trocando {chave} pelos valores de p_vars. Limpa
--    travessões, espaços duplicados e espaço antes de pontuação; nunca deixa
--    sobra feia quando uma variável vem vazia.
create or replace function public.fn_render_template(p_tpl text, p_vars jsonb)
returns text language plpgsql immutable as $$
declare k text; out text := p_tpl;
begin
  if p_tpl is null then return null; end if;
  for k in select jsonb_object_keys(coalesce(p_vars, '{}'::jsonb)) loop
    out := replace(out, '{' || k || '}', coalesce(p_vars->>k, ''));
  end loop;
  out := replace(out, '—', '');                       -- sem travessão, nunca
  out := regexp_replace(out, '[ \t]{2,}', ' ', 'g');  -- espaços duplos
  out := regexp_replace(out, ' +([,.;:!?])', '\1', 'g'); -- espaço antes de pontuação
  out := regexp_replace(out, '(^|\n)[ \t]+', '\1', 'g'); -- espaço no início da linha
  out := regexp_replace(out, '[ \t]+(\n|$)', '\1', 'g'); -- espaço no fim da linha
  return btrim(out, E' \t\n');
end; $$;

-- 3) fn_criar_notificacao: enriquece `dados`, renderiza o template (ou usa o
--    default), garante ausência de travessão e insere.
create or replace function public.fn_criar_notificacao(
  p_tipo text, p_titulo text, p_corpo text, p_dados jsonb,
  p_link text, p_actor_id uuid, p_actor_nome text
) returns void language plpgsql security definer set search_path = public as $$
declare c record; v_tit text; v_corpo text; v_dados jsonb;
begin
  select * into c from public.notificacao_config where tipo = p_tipo;
  if c.tipo is null or not c.ativo then return; end if;

  v_dados := coalesce(p_dados, '{}'::jsonb);
  -- Conveniência: se veio cliente_nome mas não `cliente`, cria o Title Case.
  if (v_dados ? 'cliente_nome') and not (v_dados ? 'cliente') then
    v_dados := v_dados || jsonb_build_object('cliente', public.fn_title_nome(v_dados->>'cliente_nome'));
  end if;

  v_tit   := coalesce(nullif(public.fn_render_template(c.titulo_template, v_dados), ''), p_titulo);
  v_corpo := coalesce(nullif(public.fn_render_template(c.corpo_template,  v_dados), ''), p_corpo);

  v_tit   := btrim(replace(v_tit,   '—', ''));
  v_corpo := btrim(replace(v_corpo, '—', ''));

  insert into public.notificacoes (tipo, titulo, corpo, dados, link, actor_id, actor_nome)
  values (p_tipo, v_tit, v_corpo, v_dados, p_link, p_actor_id, p_actor_nome);
end; $$;

-- 4) Funções geradoras: defaults sem travessão + `dados` com as variáveis
--    prontas para o template. ─────────────────────────────────────────────

-- Pré-cliente criado
create or replace function public.fn_notif_pre_cliente_criado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_autor text; v_nome text; v_af text; v_frase text; begin
  v_autor := new.dados_completos->>'cadastrado_por';
  v_nome  := coalesce(public.fn_title_nome(new.nome), 'o cliente');
  v_af    := coalesce(public.fn_primeiro_nome(v_autor), '');
  v_frase := case when v_af <> '' then 'Captado por ' || v_af || '.' else '' end;
  perform public.fn_criar_notificacao(
    'pre_cliente_criado', 'Novo pré-cliente 📁',
    btrim('Novo pré-cliente: ' || v_nome || '. Aguardando confirmação. ' || v_frase),
    jsonb_build_object('cliente_nome', new.nome, 'pre_cliente_id', new.id,
                       'cliente', v_nome, 'autor', v_frase),
    '/pre-clientes', public.fn_resolve_autor(v_autor), nullif(btrim(v_autor), ''));
  return new;
end; $$;

-- Pré-cliente confirmado (virou cliente)
create or replace function public.fn_notif_pre_cliente_confirmado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_autor text; v_cli text; v_af text; v_frase text; begin
  if new.status = 'confirmado' and (old.status is distinct from 'confirmado') then
    v_autor := new.dados_completos->>'cadastrado_por';
    v_cli   := coalesce(public.fn_title_nome(coalesce((select nome from public.clientes where id = new.cliente_id), new.nome)), 'o cliente');
    v_af    := coalesce(public.fn_primeiro_nome(v_autor), '');
    v_frase := case when v_af <> '' then 'Fechamento de ' || v_af || '.' else '' end;
    perform public.fn_criar_notificacao(
      'pre_cliente_confirmado', 'Novo cliente 👤',
      btrim(v_cli || ' virou cliente. ' || v_frase),
      jsonb_build_object('cliente_nome', coalesce((select nome from public.clientes where id = new.cliente_id), new.nome),
                         'cliente_id', new.cliente_id, 'pre_cliente_id', new.id,
                         'cliente', v_cli, 'autor', v_frase),
      coalesce('/clientes/' || new.cliente_id::text, '/pre-clientes'),
      coalesce(new.confirmed_by, public.fn_resolve_autor(v_autor)), nullif(btrim(v_autor), ''));
  end if;
  return new;
end; $$;

-- Ação protocolada
create or replace function public.fn_notif_peca_protocolada()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cli text; v_val text; begin
  if new.protocolado_at is not null and (old.protocolado_at is null) then
    v_cli := coalesce(public.fn_title_nome((select nome from public.clientes where id = new.cliente_id)), 'o cliente');
    v_val := public.fn_fmt_brl(new.valor_causa);
    perform public.fn_criar_notificacao(
      'peca_protocolada', 'Ação protocolada ☑️',
      'A ação de ' || v_cli || ' foi protocolada, com valor de causa de ' || v_val || '.',
      jsonb_build_object('cliente_nome', (select nome from public.clientes where id = new.cliente_id),
                         'cliente_id', new.cliente_id, 'valor_causa', new.valor_causa,
                         'numero_processo', new.numero_processo,
                         'cliente', v_cli, 'valor', v_val),
      coalesce('/clientes/' || new.cliente_id::text, '/esteira'), null, null);
  end if;
  return new;
end; $$;

-- Balanço comercial (diário)
create or replace function public.fn_balanco_comercial()
returns void language plpgsql security definer set search_path = public as $$
declare v_n_acoes int; v_ticket numeric; v_n_clientes int; v_ticket_fmt text; v_corpo text;
begin
  select count(*), coalesce(avg(valor_causa) filter (where valor_causa is not null), 0)
    into v_n_acoes, v_ticket from public.processos;
  select count(*) into v_n_clientes from public.clientes;
  v_ticket_fmt := public.fn_fmt_brl(v_ticket);
  v_corpo :=
       'Ticket médio dos processos: ' || v_ticket_fmt || E'\n'
    || 'Clientes: ' || v_n_clientes || E'\n'
    || 'Ações ajuizadas: ' || v_n_acoes;
  perform public.fn_criar_notificacao(
    'balanco_comercial', 'Balanço comercial 📊', v_corpo,
    jsonb_build_object('ticket_medio', v_ticket, 'n_clientes', v_n_clientes, 'n_acoes', v_n_acoes,
                       'ticket', v_ticket_fmt),
    '/dashboard', null, null);
end; $$;

-- Balanço diário (valor ajuizado + em cumprimento) — sem chamar o comercial
-- (o comercial tem cron próprio às 10:02).
create or replace function public.fn_bom_dia_ajuizado()
returns void language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_cumpr numeric; v_total_fmt text; v_cumpr_fmt text;
begin
  select coalesce(sum(valor_causa), 0) into v_total
    from public.processos where fase_processual is distinct from 'ARQUIVADO';

  select coalesce(sum(coalesce(eval, sval)) filter (where fase = 'Cumprimento de sentença'), 0)
    into v_cumpr
  from (
    select
      (select e->>'titulo' from jsonb_array_elements(p.linha_temporal) e where e->>'status'='atual' limit 1) as fase,
      (select (e->'execucao'->>'valor')::numeric from jsonb_array_elements(p.linha_temporal) e where e->>'titulo'='Cumprimento de sentença' limit 1) as eval,
      (select (e->'sentenca'->>'valor')::numeric  from jsonb_array_elements(p.linha_temporal) e where e->>'titulo'='Sentença' limit 1) as sval
    from public.processos p where p.linha_temporal is not null
  ) d;

  v_total_fmt := public.fn_fmt_brl(v_total);
  v_cumpr_fmt := public.fn_fmt_brl(v_cumpr);
  perform public.fn_criar_notificacao(
    'bom_dia', 'Balanço diário 📈',
    'Valor ajuizado: ' || v_total_fmt || E'\n' || 'Valor em cumprimento: ' || v_cumpr_fmt,
    jsonb_build_object('valor_total', v_total, 'valor_cumprimento', v_cumpr,
                       'ajuizado', v_total_fmt, 'cumprimento', v_cumpr_fmt),
    '/dashboard', null, null);
end; $$;

-- Troféu de fim de mês
create or replace function public.fn_trofeu_fim_mes(p_ref date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rubricas int; v_valor numeric; v_valor_fmt text; v_mes text; v_titulo text; v_corpo text;
begin
  select coalesce(sum(coalesce(array_length(rubricas, 1), 0)), 0) into v_rubricas
    from public.fechamentos where date_trunc('month', data) = date_trunc('month', p_ref);
  select coalesce(sum(valor_causa), 0) into v_valor
    from public.processos
    where date_trunc('month', created_at) = date_trunc('month', p_ref)
      and fase_processual is distinct from 'ARQUIVADO';
  v_mes := (array['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
                  'Agosto','Setembro','Outubro','Novembro','Dezembro'])[extract(month from p_ref)::int];
  v_valor_fmt := public.fn_fmt_brl(v_valor);
  v_titulo := '🏆 Fechamento de ' || v_mes;
  v_corpo := 'Parabéns, time! ' || v_rubricas || ' novas rúbricas ajuizáveis e ' || v_valor_fmt
             || ' em valor ajuizado no mês.';
  perform public.fn_criar_notificacao(
    'trofeu_mes', v_titulo, v_corpo,
    jsonb_build_object('rubricas', v_rubricas, 'valor', v_valor,
                       'mes', v_mes, 'valor_fmt', v_valor_fmt),
    '/fechamentos', null, null);
  return jsonb_build_object('rubricas', v_rubricas, 'valor', v_valor, 'titulo', v_titulo, 'corpo', v_corpo);
end; $$;

-- 5) Seed dos templates editáveis + dicionário de variáveis + labels sem
--    travessão. Estes viram a copy efetiva (o admin edita a partir daqui).
update public.notificacao_config set
  label = 'Pré-cliente criado',
  titulo_template = 'Novo pré-cliente 📁',
  corpo_template  = 'Novo pré-cliente: {cliente}. Aguardando confirmação. {autor}',
  variaveis = jsonb_build_object(
    'cliente', 'Nome do cliente',
    'autor', 'Frase de captação (ex.: "Captado por Diego."; vazia se desconhecida)')
where tipo = 'pre_cliente_criado';

update public.notificacao_config set
  label = 'Pré-cliente confirmado (virou cliente)',
  titulo_template = 'Novo cliente 👤',
  corpo_template  = '{cliente} virou cliente. {autor}',
  variaveis = jsonb_build_object(
    'cliente', 'Nome do cliente',
    'autor', 'Frase de fechamento (ex.: "Fechamento de Diego."; vazia se desconhecida)')
where tipo = 'pre_cliente_confirmado';

update public.notificacao_config set
  label = 'Ação protocolada (com valor da causa)',
  titulo_template = 'Ação protocolada ☑️',
  corpo_template  = 'A ação de {cliente} foi protocolada, com valor de causa de {valor}.',
  variaveis = jsonb_build_object(
    'cliente', 'Nome do cliente',
    'valor', 'Valor da causa (R$ formatado)')
where tipo = 'peca_protocolada';

update public.notificacao_config set
  label = 'Cliente assinou o contrato',
  titulo_template = 'Contrato assinado 🎉',
  corpo_template  = '{cliente} assinou o contrato.',
  variaveis = jsonb_build_object('cliente', 'Nome de quem assinou')
where tipo = 'cliente_assinou';

update public.notificacao_config set
  label = 'Balanço comercial (diário)',
  titulo_template = 'Balanço comercial 📊',
  corpo_template  = E'Ticket médio dos processos: {ticket}\nClientes: {n_clientes}\nAções ajuizadas: {n_acoes}',
  variaveis = jsonb_build_object(
    'ticket', 'Ticket médio dos processos (R$ formatado)',
    'n_clientes', 'Número de clientes',
    'n_acoes', 'Número de ações ajuizadas')
where tipo = 'balanco_comercial';

update public.notificacao_config set
  label = 'Balanço diário (valor ajuizado)',
  titulo_template = 'Balanço diário 📈',
  corpo_template  = E'Valor ajuizado: {ajuizado}\nValor em cumprimento: {cumprimento}',
  variaveis = jsonb_build_object(
    'ajuizado', 'Valor total ajuizado (R$ formatado)',
    'cumprimento', 'Valor em cumprimento de sentença (R$ formatado)')
where tipo = 'bom_dia';

update public.notificacao_config set
  label = 'Troféu de fim de mês',
  titulo_template = '🏆 Fechamento de {mes}',
  corpo_template  = 'Parabéns, time! {rubricas} novas rúbricas ajuizáveis e {valor_fmt} em valor ajuizado no mês.',
  variaveis = jsonb_build_object(
    'mes', 'Mês por extenso',
    'rubricas', 'Número de rúbricas ajuizáveis no mês',
    'valor_fmt', 'Valor ajuizado no mês (R$ formatado)')
where tipo = 'trofeu_mes';

update public.notificacao_config set
  label = 'Cumprimento de sentença (diário)',
  titulo_template = 'Cumprimento de sentença 💰',
  corpo_template  = 'Temos {valor} quase certos em {n} processos no cumprimento de sentença.',
  variaveis = jsonb_build_object(
    'valor', 'Valor em cumprimento (R$ formatado)',
    'n', 'Número de processos em cumprimento')
where tipo = 'cumprimento_manha';
