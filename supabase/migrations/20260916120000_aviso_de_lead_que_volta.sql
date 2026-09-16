-- O LEAD QUE PREENCHE O FORMULÁRIO DE NOVO TAMBÉM AVISA.
--
-- O gatilho era só de INSERT, e a justificativa parecia boa: "o lead que volta
-- não é lead novo, avisar de novo seria ruído". O teste real mostrou que ela
-- estava errada no caso que importa.
--
-- O espelho da planilha tem chave (base, telefone). Quem preenche o formulário
-- de novo com o MESMO WhatsApp não vira linha nova: vira UPDATE da linha que já
-- existia. Foi exatamente o que aconteceu duas vezes seguidas no teste — a
-- pessoa preencheu, o lead apareceu na tela com nome e hora novos, e nenhum
-- aviso saiu, porque nada foi inserido.
--
-- E olhando de fora: alguém preencher o formulário de novo É um acontecimento
-- que a equipe quer saber. Talvez seja mais interessante que o primeiro.
--
-- É o mesmo remédio que a automação já tinha levado, pelo mesmo motivo
-- (`trg_wa_automacao_lead_voltou`), e com a mesma trava: só quando a data de
-- chegada AVANÇA.
--
-- ─────────────── por que a data tem que avançar, e não só mudar ────────────
--
-- A leitura reescreve a linha quando qualquer coluna muda, e a correção de fuso
-- de hoje empurrou 714 datas de uma vez. Sem a comparação, cada uma dessas
-- viraria um aviso. Data que anda para trás ou fica igual não é alguém
-- chegando.

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
  /* No UPDATE, só vale quando a data de chegada AVANÇA: é o que distingue
     "preencheu de novo" de "a leitura reescreveu a linha". */
  if tg_op = 'UPDATE' then
    if new.chegou_em is null or old.chegou_em is null or new.chegou_em <= old.chegou_em then
      return new;
    end if;
  end if;

  select nome, instancia, notificar, notificar_desde
    into f
    from public.leads_fontes
   where id = new.fonte_id;

  if f.nome is null or not coalesce(f.notificar, false) then return new; end if;

  if f.notificar_desde is not null
     and coalesce(new.chegou_em, now()) < f.notificar_desde then
    return new;
  end if;

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

drop trigger if exists trg_notif_lead_voltou on public.leads_brutos;
create trigger trg_notif_lead_voltou
  after update of chegou_em on public.leads_brutos
  for each row execute function public.fn_notif_lead_novo_na_base();
