-- Mantém a copy/emoji original da notificação de contrato assinado (🎉). Só o
-- SOM muda (cha-ching de dinheiro no app, via tipo cliente_assinou). Reverte o
-- título de volta pro confete.
create or replace function public.fn_criar_notificacao(
  p_tipo text, p_titulo text, p_corpo text, p_dados jsonb,
  p_link text, p_actor_id uuid, p_actor_nome text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.notificacao_config c where c.tipo = p_tipo and c.ativo) then
    return;
  end if;
  if p_tipo = 'cliente_assinou' then
    p_titulo := 'Contrato assinado 🎉';
  end if;
  insert into public.notificacoes (tipo, titulo, corpo, dados, link, actor_id, actor_nome)
  values (p_tipo, p_titulo, p_corpo, coalesce(p_dados, '{}'::jsonb), p_link, p_actor_id, p_actor_nome);
end;
$$;
