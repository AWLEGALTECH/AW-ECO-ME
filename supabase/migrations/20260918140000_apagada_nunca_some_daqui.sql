-- NADA SOME DA NOSSA TELA. NEM O QUE O CLIENTE APAGA.
--
-- Corrige a migration de duas horas atrás, que eu tinha trazido do AW-ECO com
-- o comportamento de lá: "apagar para mim" escondia a mensagem, e a apagada
-- para todos virava uma bolha cinza com "Mensagem apagada" no lugar do texto.
--
-- A regra aqui é outra, e é a certa para um escritório: o conteúdo FICA,
-- sempre, e o que muda é uma tarja no rodapé da bolha dizendo o que aconteceu
-- com ela. O motivo é o que essa conversa é: prova. Cliente que manda um
-- valor e apaga trinta segundos depois apagou do aparelho dele, não do que foi
-- dito; e quem atende precisa poder ler amanhã o que estava escrito ali. Um
-- histórico que esquece junto com o WhatsApp do outro lado não serve para
-- responder "mas ele falou isso em setembro".
--
-- Então são três estados, e os três continuam mostrando a mensagem inteira:
--
--   apagada_em, na mensagem DELE   o cliente apagou no aparelho dele. Sumiu lá,
--                                  fica aqui, com tarja.
--   apagada_em, na mensagem NOSSA  nós revogamos: sumiu no aparelho dele
--                                  também. Fica aqui, com tarja.
--   so_para_mim_em                 nós tiramos só daqui. No WhatsApp dele
--                                  continua normal, e ele não faz ideia.
--
-- ── por que renomear `oculta_em` ───────────────────────────────────────────
-- "Oculta" descrevia o que a coluna fazia no AW-ECO: esconder. Aqui ela não
-- esconde nada, e um nome que promete o contrário do que a coluna faz é o
-- tipo de coisa que engana quem ler daqui a seis meses (inclusive eu). Não há
-- uma linha preenchida ainda, então o rename não custa nada.
alter table public.wa_mensagens rename column oculta_em  to so_para_mim_em;
alter table public.wa_mensagens rename column oculta_por to so_para_mim_por;

comment on column public.wa_mensagens.so_para_mim_em is
  'Apagada so do nosso lado. A mensagem CONTINUA na tela, com tarja; no WhatsApp do cliente ela segue intacta.';
comment on column public.wa_mensagens.apagada_em is
  'Apagada para todos: revogada no WhatsApp. Por nos, na mensagem nossa; pelo proprio contato, na dele. A mensagem CONTINUA na tela, com tarja.';

create or replace function public.fn_wa_mensagem_so_para_mim(p_mensagem uuid)
returns void
language sql
security invoker
set search_path to 'public'
as $$
  update public.wa_mensagens
     set so_para_mim_em = now(), so_para_mim_por = auth.uid()
   where id = p_mensagem and so_para_mim_em is null;
$$;

grant execute on function public.fn_wa_mensagem_so_para_mim(uuid) to authenticated, service_role;
drop function if exists public.fn_wa_mensagem_ocultar(uuid);

-- A PRÉVIA DA LISTA TAMBÉM PARA DE ESQUECER.
--
-- O gatilho de agora há pouco trocava `ultima_previa` por "Mensagem apagada"
-- assim que a última mensagem era revogada. Pela regra nova isso está errado
-- pelo mesmo motivo: a lista é a única coisa que se lê de relance, e trocar o
-- texto por um aviso apaga justamente o que interessa saber sem abrir. A tarja
-- mora na bolha; a prévia continua sendo o que foi dito.
drop trigger if exists trg_wa_previa_apagada on public.wa_mensagens;
drop function if exists public.fn_wa_previa_apagada();
