# CLAUDE.md — AW ECO ME

## Contexto

Sistema de gestão processual para o **Dr. Matheus Enes**.

Fork enxuto do AW-ECO (Martins Pontes Advocacia), focado em **80/20** do controle de processos.
Não inclui: atendimento WhatsApp, CRM, financeiro, marketing, publicações, gerador de docs.

## Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Recharts
- **Backend:** Supabase (projeto único)
- **Package manager:** bun (`bun install`, `bun run dev`)

## Supabase

| Projeto | Ref | Org |
|---------|-----|-----|
| AW-ECO ME | `wvltdjspytysuoybcfgb` | `grvarbsdgwylyppjwmoz` (luan-asaf-company) |

Cliente: `src/integrations/supabase/client.ts` → `supabase`

## Tabelas

- `profiles` (id, email, nome, avatar_url)
- `clientes` (id, nome, cpf_cnpj, telefone, email, endereco, observacoes)
- `processos` — campos espelhando a planilha original:
  - `numero_processo` (único)
  - `cliente_id` (FK)
  - `materia`, `fase_processual`, `tipo_pendencia`, `status_tarefa`, `parceiro`
  - `vara_juizo_origem`, `comarca_uf`
  - `data_ultimo_andamento`, `prazo_processual`
  - `valor_causa`, `observacoes`

## Regras

1. **DB — Postgres da VPS é a regra; Supabase é legado (ordem do João,
   30/08/2026):** todo dado NOVO do ME nasce no Postgres da VPS da AW
   (`163.176.179.9`), database **`aweco_me`** — usuário `me_app` (credenciais
   com o João/Luan; conexão por túnel SSH em dev, direta em produção na VPS).
   O **CRM do ME nasce 100% nesse Postgres — zero Supabase.** O projeto
   Supabase `wvltdjspytysuoybcfgb` vira legado: apenas manutenção do app
   existente (via `supabase/migrations/`), com migração gradual para o
   Postgres. O database `aweco_mp` é da operação Martins Pontes: **jamais**
   ler, escrever ou referenciar — as operações são isoladas por construção.
   Estrutura do `aweco_me` muda por SQL versionado e numerado no repo
   (ex.: `ops/sql/001_crm.sql`), nunca comando solto.
2. **Testes:** rodar `bun run build` para verificar typecheck/build
3. **Commits:** português, prefixo convencional (feat, fix, refactor, etc.)
4. **Push:** nunca fazer push sem pedir permissão
5. **Fidelidade à planilha:** nomes de campos espelham a aba ADV da planilha original — não renomear sem combinar
