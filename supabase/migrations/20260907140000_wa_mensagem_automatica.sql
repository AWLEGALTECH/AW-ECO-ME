-- QUEM MANDOU A ÚLTIMA: uma pessoa, ou o sistema?
--
-- A caixa se ordena pela última mensagem, e até aqui isso significava "alguém
-- mexeu nessa conversa". Com a retenção, deixou de significar: uma conversa
-- pode subir ao topo às três da manhã porque o despachante soltou uma mensagem
-- que alguém programou ontem. Quem abre a caixa de manhã vê movimento onde
-- ninguém trabalhou — e pior, pode responder a um "oi, tudo bem?" que ELE
-- próprio agendou, achando que o cliente escreveu.
--
-- A marca é por MENSAGEM (e não só na conversa) porque o histórico também
-- precisa dela: daqui a um mês, olhando a conversa, "isso saiu de mim ou do
-- sistema?" é uma pergunta legítima.
alter table public.wa_mensagens
  add column if not exists automatica boolean not null default false;

comment on column public.wa_mensagens.automatica is
  'True quando a mensagem saiu sozinha pelo despachante, e nao porque alguem apertou enviar.';

-- E o espelho na conversa, pra lista não precisar carregar mensagem nenhuma:
-- a caixa desenha cinquenta linhas e buscar a última mensagem de cada uma pra
-- responder uma pergunta de um pixel seria caro à toa.
alter table public.wa_conversas
  add column if not exists ultima_automatica boolean not null default false;

comment on column public.wa_conversas.ultima_automatica is
  'Espelho: a ultima mensagem da conversa saiu por automacao. Mantido pelo trigger fn_wa_toca_conversa.';

create or replace function public.fn_wa_toca_conversa()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  update public.wa_conversas c
     set ultima_em     = new.criada_em,
         ultima_previa = case new.tipo
                           when 'audio'       then '🎵 Áudio'
                           when 'imagem'      then '📷 Imagem'
                           when 'video'       then '🎬 Vídeo'
                           when 'documento'   then '📄 ' || coalesce(new.midia_nome, 'Documento')
                           when 'sticker'     then '🩶 Figurinha'
                           when 'localizacao' then '📍 Localização'
                           when 'contato'     then '👤 Contato'
                           else left(coalesce(new.texto, ''), 120)
                         end,
         -- O espelho acompanha a ÚLTIMA mensagem, seja ela qual for: uma
         -- resposta do lead depois do disparo tem que apagar a marca, senão a
         -- conversa fica com cara de automática pra sempre.
         ultima_automatica = coalesce(new.automatica, false),
         nao_lidas     = case when new.direcao = 'entrada'
                              then coalesce(c.nao_lidas, 0) + 1 else c.nao_lidas end,
         updated_at    = now()
   where c.id = new.conversa_id;
  return new;
end $function$;
