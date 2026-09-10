-- O ATALHO PASSA A LEVAR ANEXO.
--
-- A mensagem rápida era só texto, e metade do que se repete no dia não é texto:
-- é o áudio explicando o prazo, o modelo de declaração de residência, o print
-- do passo a passo para tirar o extrato no aplicativo.
--
-- MESMA FORMA DOS MODELOS DE FOLLOW-UP, e isso não é gosto: as duas coisas são
-- "uma mensagem guardada para usar depois", e `src/lib/anexos.ts` já sabe ler
-- essa forma (lista em `midias`, com o primeiro item espelhado nas colunas
-- soltas para quem ainda lê o formato antigo). Inventar um segundo jeito aqui
-- obrigaria a escrever de novo o que já existe e a manter os dois.
--
-- O TEXTO DEIXA DE SER OBRIGATÓRIO. Um atalho pode ser só o áudio, e exigir
-- legenda faria alguém escrever "segue o áudio" para o campo aceitar.

alter table public.wa_atalhos
  add column if not exists tipo       text not null default 'texto'
             check (tipo in ('texto', 'imagem', 'video', 'documento', 'audio')),
  add column if not exists midia_path text,
  add column if not exists midia_mime text,
  add column if not exists midia_nome text,
  add column if not exists duracao    int,
  add column if not exists midias     jsonb not null default '[]'::jsonb;

comment on column public.wa_atalhos.midias is
  'Os anexos do atalho, em ordem. As colunas midia_* espelham o primeiro, como em wa_followup_modelos.';

alter table public.wa_atalhos alter column conteudo drop not null;
alter table public.wa_atalhos drop constraint if exists wa_atalhos_conteudo_check;

-- Vazio dos dois lados não é atalho nenhum: seria uma barra que não faz nada.
alter table public.wa_atalhos drop constraint if exists wa_atalhos_tem_algo_check;
alter table public.wa_atalhos add constraint wa_atalhos_tem_algo_check
  check (coalesce(btrim(conteudo), '') <> '' or jsonb_array_length(midias) > 0);
