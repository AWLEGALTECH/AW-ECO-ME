-- O LEAD DE UMA CONVERSA É O PREENCHIMENTO MAIS NOVO DAQUELE TELEFONE, NÃO O
-- LINK QUE FICOU GRAVADO NA CONVERSA.
--
-- `fn_wa_automacao_lead` é quem responde "qual linha da planilha é esta
-- pessoa" para a Escolha (fn_wa_automacao_condicao) e para as variáveis
-- (fn_wa_texto_variaveis). Ela preferia `wa_conversas.lead_bruto_id`, o link
-- gravado quando a conversa nasceu, e só na falta dele procurava por telefone.
--
-- Um teste real mostrou o furo: a conversa do Luan no número Corporativo estava
-- ligada a um lead da base BRADESCO de julho ("testesson três"), de um número
-- diferente. O fluxo da recepção empresarial disparou pelo lead novo, mas leu a
-- linha antiga, que não tem coluna "Situação": todos os casos deram falso, o
-- lead caiu em "os demais", e a mensagem personalizada saiu genérica. Nenhum
-- erro em lugar nenhum.
--
-- Agora a ordem inverte: primeiro o lead mais recente daquele telefone numa
-- base DO MESMO NÚMERO, vivo (sem lápide); o link da conversa vira reserva,
-- para conversas de bases que mudaram de número. Quem preencheu de novo é
-- representado pelo que respondeu por último, que é o que faz sentido para
-- uma mensagem que diz "vi que você marcou X".
create or replace function public.fn_wa_automacao_lead(p_conversa uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select b.id
       from public.leads_brutos b
       join public.leads_fontes f on f.id = b.fonte_id
      where b.telefone = c.telefone
        and b.apagado_em is null
        and lower(f.instancia) = lower(c.instancia)
      order by b.chegou_em desc nulls last
      limit 1),
    c.lead_bruto_id)
    from public.wa_conversas c
   where c.id = p_conversa;
$function$;
