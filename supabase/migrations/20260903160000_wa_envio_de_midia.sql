-- ENVIAR ÁUDIO E ARQUIVO PELO ATENDIMENTO.
--
-- Até aqui o bucket `wa-midia` era só de leitura: o webhook (service role)
-- gravava o que CHEGAVA e a tela lia. Pra RESPONDER com foto ou áudio o
-- arquivo precisa subir do navegador — o atendente escolhe no computador ou
-- grava no microfone, e a Evolution busca esse arquivo por URL assinada.
--
-- POR QUE O ARQUIVO SOBE ANTES DE A MENSAGEM EXISTIR: a Evolution precisa de
-- uma URL pra baixar. Mandar o áudio em base64 dentro da chamada faria a
-- gravação inteira passar por dentro da edge function, que é justamente o
-- caminho que estourou o AW-ECO.
--
-- O PREFIXO `enviados/` NÃO É ORGANIZAÇÃO, É CERCA. A política de INSERT vale
-- só dentro dele; sem isso, quem pode subir uma foto poderia sobrescrever o
-- áudio que o cliente mandou — e mídia recebida é prova, não rascunho.

drop policy if exists wa_midia_envia on storage.objects;
create policy wa_midia_envia on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wa-midia'
    and (public.fn_is_admin() or public.tem_modulo('atendimento'))
    and name like 'enviados/%'
  );

-- A mensagem de saída passou a ser gravada pela edge function (service role),
-- depois que a Evolution confirma. O front não insere mais nada aqui: gravar
-- antes da confirmação deixaria na tela uma mensagem que ninguém recebeu, e
-- essa é pior que o erro — ninguém reenvia o que parece enviado.
comment on column public.wa_mensagens.direcao is
  'entrada = veio do cliente (wa-webhook); saida = enviada por nós (wa-enviar, só depois do OK da Evolution).';
