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
2. **Testes:** `bun test` (lógica), `bun run typecheck` (tipos) e `bun run build`.
   ⚠️ **O build NÃO checa tipos.** O `tsc --noEmit` que ficava ali checava ZERO
   arquivos: o `tsconfig.json` tem `"files": []` e só referências, e `tsc
   --noEmit` ignora referências (isso é `tsc -b`). Duas quebras em produção
   passaram por esse buraco — `cartaoDaInstancia is not defined` e `Cannot
   access 'pendentes' before initialization`, as duas uso antes da declaração,
   as duas invisíveis para o esbuild, que só apaga os tipos.
   O `bun run typecheck` é o de verdade (`tsc -p tsconfig.app.json`). Ele hoje
   acusa 41 erros HERDADOS, quase todos de `src/integrations/supabase/types.ts`
   desatualizado (não tem `sentencas`, `processo_fixados`, `wa_*`, `leads_*`).
   Enquanto esse passivo existir ele não pode entrar no build — mas **rode-o
   antes de entregar** e não deixe erro NOVO no arquivo que você mexeu
3. **Commits:** português, prefixo convencional (feat, fix, refactor, etc.)
3.1. **NUNCA use travessão (—) em texto que o usuário lê.** Não em string de
   tela, não em placeholder, não em toast, não em resposta de chat. Use ponto,
   vírgula, dois-pontos ou parênteses. Isto já foi pedido várias vezes; se você
   está prestes a escrever "algo — outra coisa", reescreva a frase.
3.2. **SEMPRE ANIME.** Nada aparece, some, cresce ou troca de lugar num
   piscar. Isto vale para tudo: cartão que expande, painel que abre, item que
   entra numa lista, botão que aparece porque agora há o que salvar, aba que
   troca de conteúdo. O padrão da casa é `framer-motion`, já usado em todas as
   telas:
   - **entrada:** `initial={{ opacity: 0, y: 8 }}` → `animate={{ opacity: 1, y: 0 }}`,
     com `delay` escalonado (0.05s por item) quando são vários
   - **saída:** `AnimatePresence` com `exit`. Sem ele, o que some não some, some
     de repente, e o olho perde onde estava
   - **tamanho:** `layout` (e `layoutId` quando a mesma coisa muda de forma,
     como um cartão que vira painel). Use MOLA, não duração fixa:
     `{ type: "spring", stiffness: 380, damping: 34 }`. Com `duration` a coisa
     chega ao fim e para seco, e o que tem peso desacelera
   - **curva:** `[0.22, 1, 0.36, 1]` para o resto
   - **indicador que troca de aba:** um só elemento com `layoutId` deslizando,
     nunca um fundo que acende e apaga em cada botão
   Não anime cor de hover com framer (isso é `transition-colors` do Tailwind), e
   respeite `prefers-reduced-motion` no que for contínuo.
4. **Push:** nunca fazer push sem pedir permissão
5. **Edge Functions chamadas de fora** (`wa-webhook`, `smooth-service`,
   `landing-socioeconomico`, `send-push`) exigem `verify_jwt = false`. Deploy
   pela API de gerenciamento **liga isso sozinho** e o portão do Supabase passa
   a responder 401 antes da função rodar — sem log, sem erro visível, só a
   integração parando. Depois de todo deploy dessas, conferir no painel.
5.1. **O webhook do ZapSign mora no slug `smooth-service`.** É nome automático
   de julho, e é o endereço que está cadastrado lá no ZapSign. Existe uma
   segunda cópia publicada, no slug `zapsign-webhook`, com o nome certo e
   nenhuma invocação: é decoração, e já custou uma correção inteira publicada
   no lugar errado (o lead do almyr assinou e a jornada não andou). **Antes de
   mexer em qualquer função, confira no log quem realmente recebe o POST**
   (`function_edge_logs`), não o nome que o painel mostra.
5. **Fidelidade à planilha:** nomes de campos espelham a aba ADV da planilha original — não renomear sem combinar
