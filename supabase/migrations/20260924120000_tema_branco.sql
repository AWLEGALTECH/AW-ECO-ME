-- TEMA BRANCO: papel, grafite e tinta.
-- A paleta mora na conta (preferencias_usuario.paleta), e o CHECK só conhecia
-- as cinco de antes. Sem isto, escolher "branco" gravaria no navegador e o
-- servidor recusaria, e no próximo login a conta voltaria para a cor antiga.
alter table public.preferencias_usuario
  drop constraint if exists preferencias_usuario_paleta_check;

alter table public.preferencias_usuario
  add constraint preferencias_usuario_paleta_check
  check (paleta = any (array['default', 'midnight-blue', 'vermelho', 'space-gray', 'sei', 'branco']));
