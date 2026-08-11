# AW ECO ME

Sistema de gestão processual para o **Dr. Matheus Enes**.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (Postgres + Auth)
- **Estado:** TanStack Query (com persistência local)
- **Roteamento:** React Router

## Setup

```bash
# 1. Instalar dependências
bun install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local
# Editar .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY

# 3. Rodar em dev
bun run dev
```

## Estrutura

```
src/
├── pages/
│   ├── Dashboard.tsx       — KPIs, distribuição por fase, top matérias
│   ├── Clientes.tsx        — lista + criação de clientes
│   ├── ClienteDetail.tsx   — edição + processos do cliente
│   ├── Processos.tsx       — lista com filtros (fase, matéria, parceiro)
│   ├── ProcessoDetail.tsx  — form completo (campos espelham a planilha)
│   ├── Auth.tsx            — login/cadastro
│   └── ...
├── components/
│   ├── AppSidebar.tsx
│   ├── SidebarLayout.tsx
│   ├── GlobalSearch.tsx
│   ├── UserPanel.tsx
│   └── ui/                 — primitivos shadcn
├── hooks/
│   ├── useAuth.tsx
│   └── useTheme.tsx
└── integrations/supabase/
    ├── client.ts
    └── types.ts            — gerado do banco (regerar após migrations)
```

## Banco de dados

Projeto Supabase: `wvltdjspytysuoybcfgb` (`AW-ECO` na org pessoal).

Tabelas:
- `profiles` — perfis de usuário (espelha auth.users)
- `clientes` — cadastro de clientes (único por nome case-insensitive)
- `processos` — processos com campos espelhando a planilha original:
  - `numero_processo`, `cliente_id`, `materia`, `data_ultimo_andamento`,
    `prazo_processual`, `fase_processual`, `tipo_pendencia`, `status_tarefa`,
    `vara_juizo_origem`, `observacoes`, `valor_causa`, `comarca_uf`, `parceiro`

Migrations em `supabase/migrations/`.

## Origem

Forkado do AW-ECO (operação Martins Pontes) em 2026-05-20, mantendo:
- Sistema de design (sidebar, tema, layout)
- Auth + perfis
- Páginas de Dashboard, Clientes e Processos

E removendo (fora de escopo desta operação):
- Atendimento (WhatsApp), CRM, Financeiro, Marketing
- Publicações, Generator, Diligências, Agenda, PreProtocolo
- Bot/CRM (segundo Supabase)

