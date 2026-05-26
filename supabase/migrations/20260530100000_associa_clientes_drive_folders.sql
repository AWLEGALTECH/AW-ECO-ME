-- ========================================================================
-- Associação histórica de clientes às suas pastas do Google Drive
-- ========================================================================
-- Mapeamento manual feito pelo match estrito (uppercase, sem acento) dos
-- 69 clientes contra as 108 pastas-raiz dentro de DRIVE_CLIENTES_FOLDER_ID.
--
-- 57 match estritos + 10 quase-matches confirmados pelo admin = 68 clientes
-- associados. Sobra apenas 1 sem pasta correspondente (RAIMUNDA EDIZÂNGELA
-- PINHEIRO MARQUES — pasta deve ser criada manualmente quando necessário).
--
-- Idempotente: usa WHERE drive_folder_url IS NULL no UPDATE final pra não
-- sobrescrever se rodar de novo após criação manual.
-- ========================================================================

UPDATE public.clientes c SET drive_folder_url = v.url FROM (VALUES
  -- Match estrito (nome normalizado bate exatamente)
  ('3396f225-0cf8-4d8f-b707-836e569927b2'::uuid, 'https://drive.google.com/drive/folders/1hKBJRs5KsrrzPOAHNSHonQkLSra7OFWC'), -- ALESSANDRO PESSOA DE SOUZA
  ('4d89a3a7-4a19-431f-be17-5ac96de73294'::uuid, 'https://drive.google.com/drive/folders/1T8kss4GhkY26_LjpNZcYf0EqUPvdcPC9'), -- ALZEMIR GOMES DE SOUZA
  ('9c683b4f-e8fa-4c41-b26f-96bea01edc24'::uuid, 'https://drive.google.com/drive/folders/1pUaGViJkniwAqWVntR_E5GDt6hOLLEtC'), -- ANGELA DE ALBUQUERQUE DIAS
  ('eb0c19ee-7940-41e0-ada2-4d1add929b4c'::uuid, 'https://drive.google.com/drive/folders/1CRomyRd37rQZu8ym0735XK-LGQfvbu4r'), -- BRUNO DA COSTA PAZ
  ('ceab90e3-fa5e-4cbb-84d0-f0a5ca7ecb3e'::uuid, 'https://drive.google.com/drive/folders/1UnqoAndZIcuISdmw1FEdv_JX_DEp90gj'), -- CELSON VASCONCELOS BATISTA
  ('b7223fb0-d341-4d74-a035-76b136007b9a'::uuid, 'https://drive.google.com/drive/folders/179JGKWSVK91SxdkS2GkKlCsK2Lopu1Ml'), -- CINTIA FERREIRA DA GAMA
  ('f4ef2453-a44c-4ea2-bcba-52a196820239'::uuid, 'https://drive.google.com/drive/folders/1FexWxOaDg39V-c7KBbUNd_i3AB0qecM3'), -- DANIELE FERREIRA DOS SANTOS
  ('0bf2ddc7-05cc-46ff-8223-22f2c8ad3e92'::uuid, 'https://drive.google.com/drive/folders/1qe0l0GqI_WjWzHa1jmtVZ9R866c2EMvc'), -- DARLENE ANDRADE MONTEIRO
  ('63805841-fd18-4bb0-a07c-058b1b081a77'::uuid, 'https://drive.google.com/drive/folders/10HjOAXR52y8huOhS-mHrTIrhVSnISUPO'), -- DIEIMISON DOS SANTOS CARDOSO
  ('4f0487be-22fb-41e3-a500-e3af65df2e83'::uuid, 'https://drive.google.com/drive/folders/1pFyqdied0b_RWfS9Z6Bx0w9iAajJ5oWd'), -- ELIZABETH ALVES DE SOUZA
  ('1b40d4fd-c7fb-4069-b198-b438d7f9c339'::uuid, 'https://drive.google.com/drive/folders/1cW084oqDAN5pMvli639PKDvAhsYZLCvh'), -- GABRIELA OLIVEIRA DE ALMEIDA
  ('134b35fc-1c23-4e32-8b67-34f6ab546a89'::uuid, 'https://drive.google.com/drive/folders/18Q1ztPQaTH2SDTWyF6d9vhJJGP2w3P7n'), -- HILDAMAR MACEDO CAMPOS
  ('77f6223b-cc28-4870-8691-aa5742f03cd3'::uuid, 'https://drive.google.com/drive/folders/1BPpZB8gLtMIY3Tk8qP7dxat38MQBRs2Z'), -- IDAMAR LOPES BARROS
  ('90729fb3-4414-4f61-accb-494c57613731'::uuid, 'https://drive.google.com/drive/folders/1pg-a1RI-o7dCsfY5KueBfNkBeZEECRc4'), -- JANDERSON SILVA DOS SANTOS
  ('8329875f-a1a3-472c-aa83-6704c17fe45d'::uuid, 'https://drive.google.com/drive/folders/1vu6RpEwYhlQu3O1Nvv81sYFQmM8iiYsq'), -- JERSICLEI MARIANO DE OLIVEIRA
  ('7915c410-b2be-4ee3-9772-742a96b8934a'::uuid, 'https://drive.google.com/drive/folders/1feqolDlld-NM6xyFvHnG0sCjc1GFdvHY'), -- JOÃO LUCAS SILVA DE LIMA
  ('9b236cef-1acb-4857-a6c8-053c5faafd13'::uuid, 'https://drive.google.com/drive/folders/13FRKQ-zbTiQOT9V6I0ThHG25tIecvN08'), -- JOÃO PAULO DANTAS DA COSTA
  ('d85b548a-7982-4bc9-a762-9ede9b313a90'::uuid, 'https://drive.google.com/drive/folders/1UvqZF8OQsDfTrAx69aMU6nbPMs7gTitv'), -- JOEL ALFON MIGUEL
  ('b45d09d5-6dd9-4f6b-b53e-dd1f59a7d88a'::uuid, 'https://drive.google.com/drive/folders/1F_SJEry_FyPd4PCbtJqRqp_Iej2dp3lU'), -- JOSE JERRY NUNES REGIS
  ('981f3451-9991-4f01-a181-3606f9a40c76'::uuid, 'https://drive.google.com/drive/folders/1TpTf9Eqs17E54Tl2NIsW5J6rVrXM7Fv3'), -- KARLA SOARES MACENA
  ('d2c0c270-3af9-4f12-b9cf-05bd6fd9aa33'::uuid, 'https://drive.google.com/drive/folders/1drsAvrtPlKcLp7ggrM7LQpbZWBM3hcNd'), -- KARLA THAILYNY CARDOSO DE CASTRO
  ('624cd7ff-3351-4fb5-9560-ca281f91623e'::uuid, 'https://drive.google.com/drive/folders/1DCfKifNfv4x3DR0DY8y-zdSOr_ZIhYF3'), -- KELVE LADISLAU DE ALBUQUERQUE
  ('5f59fa3c-98c3-4525-a40c-cd37053cda7c'::uuid, 'https://drive.google.com/drive/folders/1jqedfhoEYkf6uEsIwRQMXmNikpJdIjs7'), -- KENTONY VIANA PINHEIRO
  ('4173a8d0-0ff6-4617-b88a-911f2efbef33'::uuid, 'https://drive.google.com/drive/folders/1o8OtFTLoOXBmHgnOtCzTOaE-NYPo_hdF'), -- LANDERSON MAURICIO FROTA DE OLIVEIRA
  ('9f2f8787-7025-4ea3-8940-7907e9718eb4'::uuid, 'https://drive.google.com/drive/folders/1-r-tRLAAdNIq5i-h0vN0nWrouPo2wCg7'), -- LAURA MORAIS DO NASCIMENTO
  ('30b2a34a-54fd-45ae-9155-674b1d16c2c5'::uuid, 'https://drive.google.com/drive/folders/1q6xOzHJRldB-vWiebXd3vtEsTUXjYrgC'), -- LORIMAR NUNES LEAL
  ('ad950982-6adf-441f-a2d2-3861974fbe16'::uuid, 'https://drive.google.com/drive/folders/1l9SkYj_Hj_TBfZAsvLUXMXNLovrb5WI8'), -- MADELEYNE SILVA DOS SANTOS
  ('e33a7b84-a4ad-471f-8ca6-8b065aa15ee8'::uuid, 'https://drive.google.com/drive/folders/18JpK9nu2BM2Wk_gp4IeB9LGZDtZc6MRH'), -- MARA BASTOS DOS SANTOS
  ('9eb9df58-4357-4511-8bd0-cdd779c704b5'::uuid, 'https://drive.google.com/drive/folders/1b36r_eX4x6yYg9bMagG2u5XbGGExW9f2'), -- MARCOS ANTONIO MIRANDA PINTO
  ('3979e453-350e-4e52-ba27-c2aeed7237be'::uuid, 'https://drive.google.com/drive/folders/1GYMMZHeEkZel1bxS7UGtHTMguTtaI8TE'), -- MARCOS JOSÉ SANTOS GOMES
  ('1ec64de5-558a-4777-8005-e7cf7a823fd4'::uuid, 'https://drive.google.com/drive/folders/1q2-Jc58yFeWRN8qjR3H5y0a3bHc4_zKa'), -- MARIA ANGELICA TELES LIMA
  ('fa580168-67bf-46a1-8b55-4a3bac47c251'::uuid, 'https://drive.google.com/drive/folders/1uwC4AJgyXjpeXhpLcZ_vEbdSkMjD05-5'), -- MARIA CELY FERREIRA DA GAMA
  ('bde9a011-abd2-45e8-8801-ca41b6ac606e'::uuid, 'https://drive.google.com/drive/folders/19I_lPyX5yLK0SHDPxxr3xlz4wO1vxbpU'), -- MARIA IVONE DE OLIVEIRA FERREIRA
  ('c666715b-76b7-4f00-a343-d596c94fa0a0'::uuid, 'https://drive.google.com/drive/folders/1V_dGvjlfCGOAlKpavdJ-JlJBDwsYBuId'), -- MARIEUZA ALVES DE CARVALHO GARONE
  ('aa1dceb6-f2d3-437c-9aed-bc9f9cd916ac'::uuid, 'https://drive.google.com/drive/folders/1E08vy03l8_5xzA3KA6eeDtbZrDZDVQeI'), -- MIRACELVA XAVIER DA SILVA
  ('1058e7af-71aa-4f36-b082-2ddbb2db7f20'::uuid, 'https://drive.google.com/drive/folders/1ECXZnAq3AjvG-wgmonjiUPGILiap5o5V'), -- MOACY BENTO FERREIRA
  ('35eb0691-5187-4e80-b1f6-9172a88e02fe'::uuid, 'https://drive.google.com/drive/folders/1FbXCl-9Q4UeIMyjOvZzqMypE8VlSC4DL'), -- MOISES ANDRADE BRAGANCA
  ('74a53a1b-bcd2-4065-8ef5-9b73baca41d6'::uuid, 'https://drive.google.com/drive/folders/1-Z68jSWj4IfcYoNU_btiItlKtbDL_D-o'), -- MYLENA LOPES
  ('af0e7cb0-7f74-4d45-9095-26417c694f3f'::uuid, 'https://drive.google.com/drive/folders/1IRFHxckB5iUKyQBM0zJyqIluhbHci3Ya'), -- NICOLY AGUIAR PERRONE
  ('da015e20-a333-4c50-a0f1-2d491aa3e923'::uuid, 'https://drive.google.com/drive/folders/1hJH7xEFf3D676ZJmNcQmKVdV31UcDjMh'), -- R M DA COSTA REFEIÇÕES
  ('5ee1efbe-f7ea-40ec-9aea-c9d76b57fb5c'::uuid, 'https://drive.google.com/drive/folders/1NZlxPuLm0y85GRFVYgurjTHhAFLLeK8O'), -- RAIMUNDA EDIZANGELA PINHEIRO FEITOZA
  ('6b04e779-49f2-44f3-ba28-8fb6f5437093'::uuid, 'https://drive.google.com/drive/folders/1j4II4s49q5oHzovN_z04AkW5wIhYQfNH'), -- RAIMUNDO FELIPE REIS VASCONCELOS
  ('2a2a2b2b-6f19-4a46-9a34-a1d44a99f240'::uuid, 'https://drive.google.com/drive/folders/16JQ0bDYSav9DhtcWzFlm_ZIDHXJ3zMYm'), -- RAIMUNDO MORIZ DA COSTA
  ('e17ee360-065a-4912-af4e-5f2aa35e8f00'::uuid, 'https://drive.google.com/drive/folders/1PEEbSpCf7mM95fnH1Kic9w7w6anpn1_l'), -- RAIMUNDO NONATO DUARTE DINIZ
  ('faacc89b-df56-422d-a288-5d7b715fe50c'::uuid, 'https://drive.google.com/drive/folders/1vK5kgir8jA_mplmwWHtwkfQKm_nZgqxj'), -- ROBERTO DIAZ OSORIO
  ('1e2e697d-a6be-4581-9a2d-919ad7b49f4e'::uuid, 'https://drive.google.com/drive/folders/1XWZlL28FvLuoIHDmd2wkd0MSfhuK8IqO'), -- ROSÁRIA DE SOUZA FARIAS
  ('8e9135d3-e5e0-487a-b818-094061b31e07'::uuid, 'https://drive.google.com/drive/folders/1xd2K92w-C6etljGTejV-n_RLrfSzT5Ft'), -- RUAN DE OLIVEIRA MONTEIRO
  ('1d6b1e3d-99ef-47c6-b33a-88c434231922'::uuid, 'https://drive.google.com/drive/folders/17iRtxoRHJgJVH7oSgCAtokeYFb3Hht0f'), -- STHELA ARAÚJO DE CARVALHO
  ('fa212f59-e11a-4a57-a9ea-8f634e4a6d3f'::uuid, 'https://drive.google.com/drive/folders/1St8yXje3IkjgysEfvcFOw0LPum0DEtFo'), -- VANDERGLAUCIA JACOB DE ANDRADE SOUZA
  ('e69c10fe-ba28-49f6-9c43-d424b9fd8a6b'::uuid, 'https://drive.google.com/drive/folders/1y8QkBkVtdY1ZYjlpFQRfURV1GhKS7-NY'), -- VEROMARCIO MELO DE ALMEIDA
  ('e0222cbc-aa7a-4686-b965-629205348c7c'::uuid, 'https://drive.google.com/drive/folders/1YWFtLV2Ja1e5qpPKkM5fQNC-WGNobMnC'), -- VICTORIA LORENA GUIMARAES OLIVEIRA
  ('f6420b2a-1e27-4a01-a9ef-714d308f03b9'::uuid, 'https://drive.google.com/drive/folders/1oZm9Prq0nDSbU2KNYJdAAvIIFVPeeEmc'), -- WALMIR BENTO DA COSTA
  ('3f7e0b89-f92a-4680-83ad-d77aaf6cbae5'::uuid, 'https://drive.google.com/drive/folders/1lBVRoFhDYIXYBs-YQ8LPCVFdGyM9btP7'), -- WELLYSON BRUNO BARRETO DE SOUZA
  ('438dc914-e9e0-4e3f-9879-ac6983b238e4'::uuid, 'https://drive.google.com/drive/folders/1g3IaHlE9DWvoVx92VFnxOSCPuTI9e0PI'), -- WILKISON SANTANA FARIAS
  ('68f9bb6a-232f-405a-8f98-f38297803f45'::uuid, 'https://drive.google.com/drive/folders/1mKn-u_i6Kx-QZSRdOCku-P8VtQRvim5N'), -- YARA DE FRANÇA PORTELA
  ('f9645138-7d76-4c45-aec4-4efa8f1fa930'::uuid, 'https://drive.google.com/drive/folders/1S_K-Td6f_ZwRwgmm0lYuGQ7T58FBxLVu'), -- ZAFERINA CASSIANO RABELO
  ('9bbd24ae-aa82-48d3-b185-6dbb797379f4'::uuid, 'https://drive.google.com/drive/folders/1O6BLFe0jWXFAzDB3nwr43PQ2OEa6c2aJ'), -- ZANIELE FÁTIMA MENDES COSTA
  -- Quase-matches confirmados pelo admin (typos/variações de digitação)
  ('b9ee4235-6cb2-4b7e-89eb-1e7e6954902e'::uuid, 'https://drive.google.com/drive/folders/15r_LLZ69v85epGG8C1tJKDfvm6fxAnMl'), -- ALESSANDRO DE AGUIAR SOUSA <- ALESSANDRO AGUIAR DE SOUSA
  ('607c1a65-9b3f-44cc-9925-96f95633e186'::uuid, 'https://drive.google.com/drive/folders/1QEMgLPtSpcrJL_HD_X1-fg3S6JoiwBPz'), -- Cassius Clay Gama da Motta <- CASSIUS CLAY GAMA MOTTA
  ('0e095c77-6918-41aa-8299-784a29d0f46b'::uuid, 'https://drive.google.com/drive/folders/1XiC-wgMlAfWAYP0b4sr_pSY8vB6vowE1'), -- CRASSO RAMON <- CRASSO RAMOM
  ('156dbe5d-8340-463f-ba97-14d3a0ba1e51'::uuid, 'https://drive.google.com/drive/folders/1IAwyJhjz97uQgkMhOi3wDfOzsqjjG9RU'), -- FRANCIANE MARTINS LIMA FERNANDES <- FRANCIANE MARTINS DE LIMA FERNANDES
  ('dbf8e954-63f3-4315-93b6-4e2845bde85a'::uuid, 'https://drive.google.com/drive/folders/1Z99XevHpfbzn50ZHKojUy7MrNuz0t3iO'), -- FRANK <- FRANNK
  ('17a57380-4940-4d01-9a09-a7e429177b97'::uuid, 'https://drive.google.com/drive/folders/11vjrXFxeHRzFwPbUZAbcSAdPBJwvPr9J'), -- JOSÉ DJALMA CARMO DA LUZ <- JOSE DJALMA CARMO LUZ
  ('d62d7424-ad58-4425-b602-916d9ef437ad'::uuid, 'https://drive.google.com/drive/folders/1tG-tMLn5KQROqw00bCckxqLKJDF7dry_'), -- MARIA DO PERPETUO SOUZA <- SOUSA
  ('1525826e-d7ad-4378-91ca-8ffa9e4b60c8'::uuid, 'https://drive.google.com/drive/folders/1M5Z25LF83WfkjmHcOwl0j9Uns4Va2c21'), -- MARIA LIANA RABELO BARBOSA <- TATIANA BARBOSA DA COSTA (MARIA LIANA RABELO BARBOSA)
  ('db610b2c-b076-4870-b7e7-fb8d11781909'::uuid, 'https://drive.google.com/drive/folders/1uhcgGnMmfTXUc7_McXWZsf9nHPMR5m6a'), -- NOEMI DUARTE AUZIER <- NOEMI DUARTE DE AUZIER
  ('81a59ef3-8e3f-42b4-b2f0-4d40b42002c5'::uuid, 'https://drive.google.com/drive/folders/1IUV_gMyCR9u_B2MQlN5HOd18gb8ZZ8YZ')  -- WALDOMIRO JUNIOR <- WALDOMIRO JOSE
) AS v(id, url)
WHERE c.id = v.id AND c.drive_folder_url IS NULL;
