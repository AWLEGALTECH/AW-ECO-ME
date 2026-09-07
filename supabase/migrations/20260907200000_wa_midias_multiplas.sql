-- MAIS DE UM ANEXO POR MENSAGEM.
--
-- Até aqui a mensagem tinha `midia_path` — singular. Anexar o segundo arquivo
-- não dava erro: ele simplesmente TOMAVA O LUGAR do primeiro, calado. Quem
-- estava mandando três documentos de um caso descobria isso do outro lado, com
-- o cliente perguntando pelos outros dois.
--
-- A FORMA NOVA É UMA LISTA, e a antiga continua sendo o PRIMEIRO ITEM dela.
-- Isso não é gentileza com código velho: é o que deixa esta migração ser
-- aplicada sem parar o despachante no meio de uma fila com mensagens pendentes.
-- Quem só sabe ler `midia_path` continua lendo a primeira mídia e mandando algo
-- certo, ainda que incompleto; quem sabe ler `midias` manda tudo.
--
-- O TEXTO ACOMPANHA O PRIMEIRO ARQUIVO, como no WhatsApp: legenda embaixo da
-- primeira imagem, e os demais arquivos vão secos atrás. Repetir a legenda em
-- cada um faria o cliente receber o mesmo parágrafo quatro vezes.

do $$
declare
  t text;
begin
  foreach t in array array['wa_agendadas', 'wa_followup_modelos'] loop
    execute format(
      'alter table public.%I add column if not exists midias jsonb not null default ''[]''::jsonb', t);

    -- Um array, sempre. Sem isto, um objeto solto entra e o despachante
    -- quebra na hora de iterar — de madrugada, sem ninguém pra ver.
    execute format(
      'alter table public.%I drop constraint if exists %I', t, t || '_midias_lista');
    execute format(
      'alter table public.%I add constraint %I check (jsonb_typeof(midias) = ''array'')',
      t, t || '_midias_lista');

    -- O que já existe vira lista de um item. Deixar `[]` nas linhas antigas
    -- faria toda mensagem pendente com anexo sair sem ele no primeiro despacho
    -- depois desta migração.
    execute format($f$
      update public.%I
         set midias = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
               'path', midia_path, 'mime', midia_mime, 'nome', midia_nome,
               'tipo', tipo, 'duracao', duracao)))
       where midia_path is not null and jsonb_array_length(midias) = 0
    $f$, t);
  end loop;
end $$;

comment on column public.wa_agendadas.midias is
  'Anexos da mensagem, em ordem de envio: [{path, mime, nome, tipo, duracao}]. O primeiro item espelha as colunas midia_* antigas.';
comment on column public.wa_followup_modelos.midias is
  'Anexos da mensagem padrao, em ordem de envio. O primeiro item espelha as colunas midia_* antigas.';
