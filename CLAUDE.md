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

1. **DB:** sempre via `supabase/migrations/` — nunca SQL manual
2. **Testes:** `bun test` (lógica) e `bun run build` (typecheck + build).
   O build roda `tsc --noEmit` antes do Vite — sem isso o esbuild só apaga os
   tipos e erro de escopo/tipo passa direto pro deploy
3. **Commits:** português, prefixo convencional (feat, fix, refactor, etc.)
4. **Push:** nunca fazer push sem pedir permissão
5. **Edge Functions chamadas de fora** (`wa-webhook`, `zapsign-webhook`,
   `landing-socioeconomico`, `send-push`) exigem `verify_jwt = false`. Deploy
   pela API de gerenciamento **liga isso sozinho** e o portão do Supabase passa
   a responder 401 antes da função rodar — sem log, sem erro visível, só a
   integração parando. Depois de todo deploy dessas, conferir no painel.
5. **Fidelidade à planilha:** nomes de campos espelham a aba ADV da planilha original — não renomear sem combinar
