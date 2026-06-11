# Análise comercial + rubricas não ajuizáveis — contrato AW-FINDER ⇄ AW-ECO-ME

Os dois apps compartilham o **mesmo projeto Supabase** (`wvltdjspytysuoybcfgb`).
Este documento define o que o **AW-FINDER** (repo separado `AWLEGALTECH/AW-FINDER`,
servido em iframe via `public/finder-app/`) precisa ler/gravar pra que o fluxo
de "análise comercial" e o "princípio das rubricas não ajuizáveis" funcionem
ponta a ponta. O lado do aw-eco-me (schema, Writer, ficha) já está pronto.

## Conceito

A atendente comercial roda o Finder **isolado** (sem cliente vinculado), joga
os extratos, vê os descontos e:
- marca rubricas que **não podem ser ajuizadas** (cliente não quer, ou já tem
  ação de outro advogado) → ficam cinza + cadeado + não-clicáveis;
- clica em **"Salvar análise comercial"** → grava `nome` + `rubricas` (com as
  flags de bloqueio) na tabela `analises_comerciais`.

Depois, no Writer, dá pra **selecionar uma análise comercial** (além de puxar
da base de clientes), que pré-preenche o nome e carrega as rubricas bloqueadas
no cliente. Na **análise vinculada** futura, os descontos bloqueados aparecem
travados, com opção de **"cancelar inviabilidade"** (com confirmação).

## Tabela `analises_comerciais` (já criada)

| coluna | tipo | notas |
|--------|------|-------|
| `id` | uuid | pk, default gen_random_uuid() |
| `nome` | text | NOT NULL — nome do cliente/lead da análise |
| `cpf_cnpj` | text | opcional |
| `rubricas` | jsonb | array de itens (ver abaixo), default `[]` |
| `planilha_url` | text | link da planilha gerada pelo Finder |
| `drive_folder_url` | text | opcional |
| `cliente_id` | uuid | preenchido quando vira cliente (FK clientes) |
| `origem` | text | use **`'finder'`** (a policy anon-insert exige isso) |
| `status` | text | `aberta` (default) · `usada` · `arquivada` |
| `observacoes` | text | opcional |
| `created_by` | uuid | id do user, se houver |
| `created_by_email` | text | email do autor (atendente) |
| `created_at` / `updated_at` | timestamptz | automáticos |

### Formato de cada item de `rubricas`

```json
{
  "rubrica": "SEGURO PRESTAMISTA",
  "valor": 1234.56,
  "bloqueada": true,
  "motivo": "cliente_nao_quer"
}
```

- `bloqueada`: `true` quando a atendente sinalizou inviabilidade.
- `motivo`: **`"cliente_nao_quer"`** ou **`"ja_ajuizada"`** (ou `null` se não
  bloqueada). Use exatamente essas strings — o aw-eco-me espera elas.

## O que o AW-FINDER precisa fazer

### 1. Modo isolado (comercial)
- Botão por rubrica: **marcar/desmarcar inviabilidade**. Ao marcar, abrir um
  prompt perguntando o motivo (`cliente_nao_quer` | `ja_ajuizada`) e renderizar
  a rubrica cinza + cadeado + não-clicável.
- Botão **"Salvar análise comercial"** → `INSERT` em `analises_comerciais`
  (anon key) com `origem='finder'`, `nome`, `rubricas` (todas, com flags),
  `planilha_url`, `created_by_email`.
  - Pode reusar/atualizar (`UPDATE`) a mesma análise se salvar de novo.

### 2. Modo vinculado (análise vinculada de um cliente)
- Ao abrir a análise de um cliente, **ler** `clientes.rubricas_bloqueadas`
  (anon SELECT já liberado) — array de `{ rubrica, motivo }`.
- Renderizar essas rubricas **travadas** (cinza + cadeado), não-clicáveis.
- Botão **"Cancelar inviabilidade"** por rubrica → **popup de confirmação**
  ("apesar dos motivos sinalizados no comercial…") → ao confirmar, libera a
  rubrica naquela sessão. (Persistir a remoção é opcional: pode atualizar
  `clientes.rubricas_bloqueadas` removendo o item.)

### Exemplo de INSERT (anon key, PostgREST)

```
POST /rest/v1/analises_comerciais
apikey: <ANON_KEY>
Authorization: Bearer <ANON_KEY>
Prefer: return=minimal
{
  "nome": "FULANO DE TAL",
  "cpf_cnpj": "000.000.000-00",
  "origem": "finder",
  "planilha_url": "https://docs.google.com/...",
  "created_by_email": "adria@...",
  "rubricas": [
    { "rubrica": "SEGURO PRESTAMISTA", "valor": 1234.56, "bloqueada": true,  "motivo": "ja_ajuizada" },
    { "rubrica": "TARIFA PACOTE",      "valor": 89.90,   "bloqueada": false, "motivo": null }
  ]
}
```

## O que o aw-eco-me já entrega (este repo)

- **Schema** acima (`analises_comerciais` + `clientes.rubricas_bloqueadas`).
- **Writer**: aba "Selecionar análise comercial" — lista análises `status='aberta'`,
  pré-preenche nome e leva as rubricas bloqueadas pro pré-cliente/cliente.
- **Conversão pré-cliente → cliente**: copia as rubricas bloqueadas pra
  `clientes.rubricas_bloqueadas` e marca a análise como `usada` (`cliente_id`).
- **Ficha do cliente / análise primária**: mostra as rubricas bloqueadas com o
  motivo, pro advogado já saber o que não entra antes de produzir.
