-- O NOME QUE O NÚMERO TEM NESTA TELA, E HÁ QUANTO TEMPO ELE ESTÁ DE PÉ.
--
-- ─────────────────────────── o nome exibido ────────────────────────────────
--
-- O nome da instância na Evolution é uma CHAVE: é por ele que a conversa acha o
-- número, que o webhook casa a mensagem, que o despachante escolhe por onde
-- mandar. Renomear lá é operação de risco e ninguém faz por gosto — e é por
-- isso que os nomes ficam como nasceram, "PORTAL DIREITO ABERTO 2", em caixa
-- alta, com numeração de quem criou às pressas.
--
-- Só que quem trabalha na tela o dia inteiro não fala assim. Este campo separa
-- as duas coisas: a Evolution continua com a chave dela, e a tela passa a ter
-- um rótulo escolhido por gente. NADA no sistema procura por `nome_exibido` —
-- se um dia ele sumir, o pior que acontece é a tela voltar a mostrar o nome
-- técnico.
--
-- ────────────────────────── conectada desde quando ──────────────────────────
--
-- `sincronizado_em` responde "quando a tela conferiu isto pela última vez", que
-- é quase sempre "há um minuto" e não serve pra nada. A pergunta que se faz
-- olhando um número é outra: ele está de pé desde quando? Uma sessão que subiu
-- há dez minutos e uma que está firme há três semanas contam histórias
-- diferentes sobre a mesma palavra "conectado" — e é a primeira que explica por
-- que as mensagens de ontem não chegaram.
--
-- MARCADO POR GATILHO, na virada do status. O espelho é reescrito a cada
-- sincronização com a Evolution, e quem escreve não sabe nem precisa saber se
-- aquilo é uma mudança ou uma repetição do que já estava lá — se a marca fosse
-- responsabilidade de quem escreve, ela se perderia na primeira função nova que
-- tocasse na tabela.
alter table public.wa_instancia_marca
  add column if not exists nome_exibido text
    check (nome_exibido is null or (btrim(nome_exibido) <> '' and length(nome_exibido) <= 60));

comment on column public.wa_instancia_marca.nome_exibido is
  'Como este numero se chama NESTA TELA. O nome da Evolution continua sendo a chave de tudo; isto e so rotulo.';

alter table public.wa_instancias
  add column if not exists conectada_desde timestamptz;

comment on column public.wa_instancias.conectada_desde is
  'Quando a sessao subiu. Marcado por gatilho na virada de status; nulo quando o numero nao esta conectado.';

create or replace function public.fn_wa_instancia_conectada_desde()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.conectada_desde := coalesce(
      new.conectada_desde,
      case when new.status = 'conectado' then now() end);
    return new;
  end if;

  /* SÓ A VIRADA MOVE A MARCA. Sem o segundo ramo, cada sincronização — que
     reescreve a linha inteira a cada minuto — apagaria o carimbo, e ele voltaria
     a ser "conectada desde agora", que é a mesma inutilidade do
     `sincronizado_em`.

     ⚠️ O `elsif ... is null` no lugar de um `else` seco é a correção de um erro
     que este gatilho cometeu contra a própria migração: com `else`, ele
     sobrescrevia QUALQUER escrita deliberada na coluna — inclusive a carga
     inicial logo abaixo, que rodou, foi engolida, e deixou os três números
     "conectados desde nunca". Preservar o antigo só quando ninguém escreveu
     nada é o que separa "a sincronização não mexeu nisto" de "alguém está
     dizendo qual é o valor". */
  if new.status is distinct from old.status then
    new.conectada_desde := case when new.status = 'conectado' then now() end;
  elsif new.conectada_desde is null then
    new.conectada_desde := old.conectada_desde;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wa_instancia_conectada_desde on public.wa_instancias;
create trigger trg_wa_instancia_conectada_desde
  before insert or update on public.wa_instancias
  for each row execute function public.fn_wa_instancia_conectada_desde();

/* Os que já estão conectados ganham a última sincronização como marca inicial.
   É a melhor aproximação que existe: não sabemos quando a sessão subiu, e um
   nulo aqui faria a tela dizer "desconectado" pra número que está de pé. */
update public.wa_instancias
   set conectada_desde = sincronizado_em
 where status = 'conectado' and conectada_desde is null;
