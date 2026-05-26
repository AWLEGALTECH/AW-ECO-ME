-- Adiciona drive_folder_id em clientes (alem do drive_folder_url ja existente).
-- Necessario pra criar e organizar subpastas (Documentos, Pecas) dentro
-- da pasta-pai do cliente via Google Drive API.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS drive_folder_id text;

CREATE INDEX IF NOT EXISTS clientes_drive_folder_id_idx
  ON public.clientes(drive_folder_id)
  WHERE drive_folder_id IS NOT NULL;
