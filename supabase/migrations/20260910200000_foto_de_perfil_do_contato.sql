-- A FOTO DE PERFIL DO CONTATO.
--
-- A conversa mostrava as iniciais do nome em todo lugar. A foto existe no
-- WhatsApp e a Evolution sabe devolvê-la; ninguém buscava.
--
-- GUARDAMOS A IMAGEM, E NÃO O ENDEREÇO DELA. A URL que o WhatsApp devolve vem
-- com credencial temporária e morre em dias: gravar a URL faria os avatares
-- virarem imagem quebrada semanas depois, sem nada dizendo por quê. Então a
-- imagem desce para o mesmo balde da mídia da conversa e o que fica aqui é o
-- caminho, como já é com áudio e PDF.
--
-- `foto_em` É O QUE IMPEDE A INSISTÊNCIA. Muita gente não tem foto ou escondeu
-- nas configurações de privacidade, e sem uma marca de "já perguntei" cada
-- mensagem nova dispararia outra busca que vai falhar do mesmo jeito. Caminho
-- vazio com data preenchida quer dizer: perguntamos, e não há foto.
--
-- `foto_url` fica onde está, vazia: a versão da tela que está no navegador de
-- alguém ainda pede essa coluna, e tirá-la agora quebraria a caixa de entrada
-- até o navegador receber a versão nova. Sai numa limpeza depois.

alter table public.wa_conversas
  add column if not exists foto_path text,
  add column if not exists foto_em   timestamptz;

comment on column public.wa_conversas.foto_path is
  'Caminho da foto de perfil do contato no balde wa-midia. Null com foto_em preenchido = perguntamos e nao ha foto.';
comment on column public.wa_conversas.foto_em is
  'Quando perguntamos a foto pela ultima vez. Existe para nao perguntar de novo a cada mensagem de quem nao tem foto.';
