-- O UPLOAD DE UMA MENSAGEM RETIDA ESTAVA SENDO RECUSADO.
--
-- A política de escrita no bucket exigia `name like 'enviados/%'`, e a retenção
-- grava em `agendados/`. O erro que chegava na tela era "new row violates
-- row-level security policy" — que não diz nada sobre prefixo nenhum, e por isso
-- parecia problema de permissão do usuário.
--
-- O prefixo restrito NÃO é burocracia e fica: sem ele, quem tem o atendimento
-- poderia escrever em qualquer lugar do bucket, inclusive por cima da mídia
-- RECEBIDA (que o webhook grava em `<conversa_id>/...` como service role) —
-- trocar a foto que um cliente mandou por outra, sem deixar rastro.
--
-- Então a política passa a aceitar os dois caminhos, e só os dois.
drop policy if exists "wa_midia_envia" on storage.objects;

create policy "wa_midia_envia" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wa-midia'
    and (public.fn_is_admin() or public.tem_modulo('atendimento'))
    and (name like 'enviados/%' or name like 'agendados/%')
  );
