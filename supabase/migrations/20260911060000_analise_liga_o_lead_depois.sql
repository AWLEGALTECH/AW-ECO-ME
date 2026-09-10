-- A ANÁLISE MOVE O LEAD MESMO QUANDO O VÍNCULO CHEGA DEPOIS.
--
-- A jornada avançava quando a análise comercial NASCIA ligada a uma conversa, e
-- ela só nascia ligada quando o Finder era aberto pelo botão "Levar ao Finder",
-- de dentro do atendimento. Aberto pelo menu, o `conversa_id` fica nulo: a
-- análise fica pronta, o lead fica em "Aguardando análise" para sempre, e
-- ninguém recebe erro nenhum. É o modo mais silencioso de um funil mentir.
--
-- Duas mudanças:
--
-- 1. O GATILHO TAMBÉM ESCUTA O `update of conversa_id`. Ligar a análise ao lead
--    depois passa a valer tanto quanto ter ligado na hora, e é o que faz o
--    conserto ser possível: quem esqueceu conserta escolhendo o lead, de
--    qualquer tela, sem refazer a análise.
--
-- 2. O ALVO SAI DA RÉGUA DA CONVERSA. Estava fixo em 'aguardando_documentos',
--    que é etapa da Bradesco: análise ligada a um lead da régua padrão não
--    movia nada, porque lá essa chave nem existe. Na padrão o equivalente é
--    'proposta', que quer dizer "já sei o que dá pra pedir" — e isso passa a
--    ser verdade exatamente quando a análise fica pronta. É também o que fecha
--    o buraco que a régua padrão tinha: o PDF chegando não move (ninguém
--    analisou ainda), mas a análise saindo move.

create or replace function public.fn_wa_alvo_da_analise(p_jornada text)
returns text language sql immutable as $$
  select case when p_jornada = 'bradesco' then 'aguardando_documentos' else 'proposta' end
$$;

create or replace function public.fn_wa_analise_avanca_jornada()
returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_jornada text;
begin
  if new.conversa_id is null then return new; end if;
  -- Num update, só interessa quando o vínculo MUDOU: salvar de novo a mesma
  -- análise não é notícia nova sobre o lead.
  if tg_op = 'UPDATE' and old.conversa_id is not distinct from new.conversa_id then
    return new;
  end if;

  select jornada into v_jornada from public.wa_conversas where id = new.conversa_id;
  if v_jornada is null then return new; end if;

  perform public.fn_wa_avancar_etapa(new.conversa_id, public.fn_wa_alvo_da_analise(v_jornada));
  return new;
end $function$;

drop trigger if exists trg_wa_analise_avanca_jornada on public.analises_comerciais;
create trigger trg_wa_analise_avanca_jornada
  after insert or update of conversa_id on public.analises_comerciais
  for each row execute function public.fn_wa_analise_avanca_jornada();
