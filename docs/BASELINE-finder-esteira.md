# BASELINE — Estado exato do Finder ↔ Esteira (retrato de segurança)

> Registrado antes de qualquer alteração relacionada à feature de "validar
> desconto / pré-análise comercial". Serve como ponto de restauração e como
> referência para provar que nada mudou de comportamento.
> Data de registro: 2026-07-08.

## 1. Pontos de restauração (git)
- **AW-ECO-ME** HEAD: `e0641866ba189d011d84d5b6363ce97be2ef6fbd` (branch `claude/blissful-mendel-0xbq6z`)
- **AW-FINDER**  HEAD: `29bfd556213bfc2c6e6ba14ba5f5362efd7f8542` (branch `master`)

Restaurar o Finder que roda hoje (bundle commitado no eco):
`git checkout e0641866 -- public/finder-app`

## 2. O que roda HOJE em produção (bundle embutido no eco)
O eco embute o Finder via iframe em `/finder-app/index.html`. É um artefato
**commitado** (a Vercel serve os arquivos físicos antes do rewrite de SPA).

Checksums (sha256) dos 5 arquivos servidos:
```
095215a0f7871eefcdde3e905046461d6ee66cc767d32654a215520b839c12a9  public/finder-app/assets/index-DYBOv29h.js
9ab38f8e8fc897dcb4bf4e9441f07d11e41135baf716c24e120395d644f34a6e  public/finder-app/assets/src-EIDR2zc6.js
8ac5ed995780faa62c9e394477896a33fd82bf2da23f3e2edf304915ab5fdb74  public/finder-app/aw-logo.svg
418f25ece509d10d36af611d65c88f1c0c9d1c7295ac4fb721a0b4538dac0b2b  public/finder-app/index.html
42fab1f017aedab69b92bdecc01bbb11166cd3b177575612ee860f8e2825ece0  public/finder-app/tesseract/por.traineddata
```
> Observação: o bundle acima foi buildado de ALGUM commit do AW-FINDER que pode
> ou não ser o HEAD atual (29bfd55). Verificar equivalência antes de trocar.

## 3. Contrato de integração (como o eco e o Finder conversam) — NÃO QUEBRAR
- **Embed:** iframe `src="/finder-app/index.html"`. Modo cliente-linked recebe
  query params `?cliente=&nome=&drive=&drive_folder_id=`. Modo standalone (menu
  lateral) não recebe params.
- **Banco:** o Finder embutido escreve **direto no Supabase** (com a chave ANON),
  projeto **`wvltdjspytysuoybcfgb`** (o MESMO banco do eco). Não depende do
  `/api` serverless do repo AW-FINDER (esse só existe no deploy standalone dele).
- **Webhook:** chama `https://n8n.awlegaltech.com.br` (n8n).
- **Assets externos:** cdnjs.cloudflare.com, fonts.googleapis.com, tesseract local.
- **Hook host↔finder:** `AW-FINDER/src/App.jsx:848` — o Finder emite eventos que o
  "host (AW-ECO wrapper) pode escutar e integrar; standalone: ninguém escuta".

## 4. Tabelas do banco que o Finder toca (projeto wvltdjspytysuoybcfgb)
### 4.1 `demandas` (a esteira) — escrita principal do Finder
Cada desconto ajuizável vira uma linha (`tipo=pre_protocolo`, `etapa=analise_vinculada`,
`status=pendente`, campo `desconto`, `analise_pai_id`, etc.).
RLS crítica (preservar EXATAMENTE):
- `demandas_anon_insert_analise` (INSERT anon): `tipo='pre_protocolo' AND etapa='analise_vinculada' AND status='pendente'`
- `demandas_anon_select_analise_vinc` (SELECT anon): `etapa IN ('analise_vinculada','analise_documental')`
- `demandas_auth_all` (ALL authenticated): true
Total de linhas no registro: **338**.

### 4.2 `analises_comerciais` — pré-análise comercial (JÁ EXISTE, escrita pelo Finder)
Colunas: `id, nome, cpf_cnpj, rubricas(jsonb), planilha_url, drive_folder_url,
cliente_id, origem(default 'finder'), status(default 'aberta'), observacoes,
created_by, created_by_email, created_at, updated_at`.
Formato de cada item em `rubricas` (jsonb): `{ valor, motivo, rubrica, bloqueada }`
(ex.: `{valor:260.77, motivo:"cliente_nao_quer", rubrica:"Encargos", bloqueada:true}`).
RLS: anon INSERT (com `origem='finder'`), anon SELECT (true), anon UPDATE (true),
authenticated ALL. Linhas no registro: 1.

### 4.3 `clientes` — leitura + flags de análise
Campos relevantes: `rubricas_bloqueadas jsonb default '[]'`,
`analise_primaria_finalizada_at/by`, `precisa_analise_extratos`, `requerido`,
`drive_folder_url/id`, dados de qualificação.

## 5. Como a Esteira já usa "bloqueada" (funcionalidade existente)
`src/pages/Esteira.tsx` já renderiza demandas **bloqueadas** (acinzentadas, com
cadeado e `motivoBloqueio`). Ou seja, o conceito de desconto bloqueado/validado
já flui visualmente na esteira.

## 6. Garantias assumidas
- Nenhuma alteração destrutiva no banco; as políticas RLS acima são preservadas.
- `public/finder-app/` só é trocado após um rebuild ser provado equivalente numa preview.
- Nada do que já existe (Finder, esteira, analises_comerciais, rubricas_bloqueadas) é removido.
