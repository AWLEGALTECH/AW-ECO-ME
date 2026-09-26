# Finder: o contrato com o AW ECO ME

**Levantado em 25/09/2026**, antes da migração do Finder de pacote compactado
(`public/finder-app/`, iframe) para código próprio dentro do AW.

Este documento é a lista de tudo o que o Finder recebe e tudo o que ele entrega.
A migração só está pronta quando **cada linha daqui** continua funcionando igual.
Da última tentativa de migrar, as ligações se soltaram: esta lista existe para
isso não se repetir.

---

## 1. De onde vem o código

| O quê | Onde | Situação |
|---|---|---|
| Finder que roda hoje no ME | `public/finder-app/assets/index-DYBOv29h.js` (750 KB, compactado) | sem código-fonte |
| Código-base (leitor de extrato, telas) | `AWLEGALTECH/AW-FINDER` (`src/`) e cópia idêntica em `AWLEGALTECH/AW-ECO` (`src/apps/finder/`) | legível, mais novo que o do ME em alguns pontos |
| Camada do ME (cliente, Drive, vincular análise) | só no pacote compactado | **não existe em repositório nenhum**: procurado no AW-FINDER (4 ramos) e no AW-ECO (incluindo os ramos de ME) |

Decisão (25/09): o AW ECO ME passa a ter **cópia oficial própria** do Finder. O
AW-ECO (Martins Pontes) não é tocado.

---

## 2. As três portas de entrada

| Modo | Endereço | Quem abre | Onde roda |
|---|---|---|---|
| Solto | `/finder` | menu lateral | iframe da página `Finder.tsx` |
| Cliente (análise primária) | `/finder?cliente=<id>&nome=<nome>` | Esteira (`Esteira.tsx:1129`), ficha do cliente (`ClienteDetail.tsx:2831`, depois de criar a `analise_documental`), `EsteiraInicioDialog.tsx:103`, `RefazerAnaliseComercialDialog.tsx:634`, pílula (`FinderPill.tsx:36`) | iframe **persistente** do `PersistentFinderHost` (não fecha ao trocar de tela) |
| Conversa (lead do atendimento) | `/finder?conversa=<id>&nome=<nome>&docs=<ids de mensagem>` | botão "Levar ao Finder" (`Atendimento.tsx:1265`, `linkDoFinder` em `finderDaConversa.ts`) | iframe da página, em aba nova |
| Refazer análise comercial | `/finder?refazerComercial=<cliente>&refazerNome=<nome>` | lido em `Finder.tsx:86` | iframe da página |

---

## 3. O que o Finder RECEBE

### 3.1 Pelo endereço do iframe
- `cliente`, `nome`: a faixa "Analisando extratos para: *nome*" e o cliente já escolhido no "Vincular Análise".
- `drive`, `drive_folder_id`: a pasta do Google Drive do cliente (vem de `clientes.drive_folder_url`), para o botão "Buscar do Drive do cliente".

### 3.2 Pelos arquivos (modo conversa)
`Finder.tsx` baixa os PDFs escolhidos do bucket **`wa-midia`** (pelos ids de
`wa_mensagens`, nunca pelo caminho), espera o `input[type=file][accept=".pdf"]`
do Finder aparecer (até 20 s) e **enfia os arquivos nele**, criando `File` e
`DataTransfer` do lado de dentro do iframe e disparando `change`. A pessoa ainda
clica em "Analisar".

### 3.3 Pelo tema
Lê `localStorage['aw-theme-palette']` ao abrir e escuta `postMessage({type:'aw-theme:palette'})`.
O tema branco depende de `--sat-destaque` (ver `public/finder-app/index.html`).

---

## 4. O que o Finder ENVIA

### 4.1 Evento `aw-finder:analysis-ready` (na `window` do Finder)
Disparado quando a análise termina. Quem escuta: `FinderAnaliseComercial.tsx`
(prende o ouvinte na `contentWindow` do iframe, conferindo a cada 1,5 s).
Formato do `detail` no pacote do ME:

```
meta               { clientName, banco, agencia, conta, periodo, ... }
grouped            OBJETO por categoria { [id]: { cat, items[] } }   (não é lista)
rubricas           string[]  (só as reembolsáveis)
rubricasDetalhadas [{ id, label, total, dataInicioISO, dataFimISO, items[{data,dataISO,valor,descricao}] }]
totalDescontos     number
periodoISO         { inicio, fim }
fileName           string
buildXlsxBlob      () => Promise<Blob>   planilha "Descontos Identificados" + uma aba por rubrica
```

A versão-base mais nova acrescenta `rubricasAnuladas` (ver seção 8).

### 4.2 Evento `aw-finder:reset`
Quando volta para a tela de envio sem nada analisado. Limpa o botão da análise comercial.

### 4.3 "Vincular Análise" (só existe no pacote do ME)
Botão dentro do Finder. Escolhe o cliente (lista de `clientes`, ou o da URL),
uma ou várias categorias, e faz:

1. **Planilha** no bucket público **`analises-vinculadas`**, nome
   `<timestamp>-<aleatório>-<arquivo>.xlsx`. Guarda a URL pública.
2. **Demanda** em `demandas`:
   ```
   cliente_id, tipo='pre_protocolo', etapa='analise_vinculada', status='pendente', ordem=1,
   titulo='Análise vinculada — <desconto>',
   desconto='<Categoria A> + <Categoria B>'   (separador exato: espaço, +, espaço)
   peca_drive_url=<URL pública da planilha>,
   descricao='<n> lançamento(s) · total R$ X',
   analise_pai_id=<a analise_documental MAIS RECENTE do cliente>,
   banco, agencia, conta, data_inicio_desconto, data_fim_desconto
   ```
3. **Selo "Vinculado"** em cada categoria: lê as `analise_vinculada` do cliente,
   quebra `desconto` por ` + ` e conta quantas vezes cada nome aparece.

Textos que só existem aqui: "Vincular Análise", "Escolher cliente",
"Nenhum cliente cadastrado.", "Vinculado ao cliente", "Buscar do Drive do cliente",
"Analisando extratos para:".

### 4.4 Google Drive (só no pacote do ME)
Funções `list-drive-files` (`{folder_id, mime_filter}`) e `fetch-drive-file`
(`{file_id}`, devolve o arquivo com `X-File-Name` e `X-File-Mime`).

### 4.5 Como ele fala com o banco hoje
Com a **chave pública (anon)** escrita dentro do pacote, e não com o login de
quem está usando. Por isso existem políticas abertas para `anon` (seção 9).

---

## 5. O que o AW faz POR CIMA do Finder

| Peça | Arquivo | O que faz | Grava em |
|---|---|---|---|
| Gerar análise comercial | `FinderAnaliseComercial.tsx` | botão flutuante depois do `analysis-ready`; marca rubricas **não ajuizáveis** (motivo: rúbrica inválida, já ajuizada, cliente não quer); pergunta de qual lead é, se não veio de conversa | `analises_comerciais` `{nome, origem:'finder', rubricas:[{rubrica,valor,bloqueada,motivo}], created_by, created_by_email, conversa_id?}` |
| Refazer análise comercial | mesmo arquivo, modo `refazerComercial` | substitui a análise do cliente e recalcula o fechamento | RPC `fn_editar_analise_comercial(p_cliente_id, p_analise:{origem:'finder',rubricas}, p_editor)` |
| Lead anda sozinho | gatilho `trg_wa_analise_avanca_jornada` | análise com `conversa_id` move o lead para Proposta e batiza com o nome do titular | `wa_conversas` |
| Ligar análise depois | `VincularAnalise.tsx` (Atendimento) | liga uma análise solta a uma conversa | `analises_comerciais.conversa_id` |
| Ciência + cadeado | `FinderCienciaComercial.tsx` + `lib/finderBloqueio.ts` | no modo cliente, mostra a faixa "Bloqueado no comercial" e **põe um cadeado por cima do cartão** de cada rubrica bloqueada dentro do Finder (lê o DOM do iframe, casa pelo **nome** da rubrica, engole cliques); clicar no cadeado pede desbloqueio | `clientes.analise_comercial` |
| Sessão persistente | `useFinderSession.tsx`, `PersistentFinderHost.tsx`, `FinderPill.tsx` | iframe continua vivo ao trocar de tela; pílula com cronômetro; "concluído" quando aparece `analise_vinculada` (ou `fluxo_artesanal`) nova do cliente (consulta a cada 8 s); guarda em `sessionStorage` (`finder-session-v1`, `finder-status-v1`) | nada |
| Faixa do cliente e botão do Drive | `PersistentFinderHost.tsx` | "Analisando extratos de…", "Pasta no Drive", "Minimizar", "Finalizar análise" | nada |

---

## 6. Quem usa o resultado DEPOIS (não toca no Finder)

Continuam funcionando se as linhas gravadas tiverem o mesmo formato:

- **Writer**: lista `analises_comerciais` (kit, `?analise_comercial=`), e preenche agência, conta e datas pela `analise_vinculada` (`?analise_id=`).
- **Pré-cliente → cliente**: `dadosKit._analise_comercial` vira `clientes.analise_comercial` (`PreClientes.tsx`), que alimenta o fechamento (`fn_recalcular_fechamento`, `fn_fechamento_ao_confirmar_pre_cliente`).
- **Ficha do cliente e Esteira**: `analise_vinculada` agrupadas por `analise_pai_id`, link da planilha (`peca_drive_url`), contagem de demandas abertas.
- **Levas / grupos**: `fn_salvar_grupo_analise`, `fn_excluir_leva_analise`, `RefazerAnaliseComercialDialog.tsx`.

---

## 7. O que NÃO pode mudar (checklist de paridade)

- [ ] **Nomes das rubricas idênticos, letra por letra.** O cadeado, a análise
  comercial, o Writer e a Esteira casam por nome. Nomes já gravados no banco em
  25/09, todos presentes nas duas versões: Parcela de Crédito Pessoal, Mora de
  Crédito, Pacotes e Cestas, Encargos, Saque Terminal, Gastos com Cartão, BX
  Antecipação Financeira, Emissão de Extrato, Título de Capitalização, Anuidade e
  Cartão, Seguro / Vida e Previdência, Extrato Movimento, Dívida em Atraso,
  Cobranças Indevidas, Outras Cobranças, Adiantamento ao Depositante,
  Reorganização Financeira, Regularização de Lançamento, Operações Vencidas.
- [ ] `demandas.desconto` com o separador ` + `.
- [ ] `tipo`, `etapa`, `status`, `ordem`, `analise_pai_id` (a `analise_documental` mais recente) iguais aos da seção 4.3.
- [ ] Planilha no bucket `analises-vinculadas` com URL pública em `peca_drive_url`, mesmas abas.
- [ ] `analysis-ready` com o mesmo `detail` (no código novo pode virar uma função chamada direto, mas com os mesmos campos).
- [ ] Modo conversa entrega os PDFs na fila sem clique extra de upload.
- [ ] Cadeado das rubricas bloqueadas continua impedindo o clique (no código novo, direto na tela, sem ler DOM de iframe).
- [ ] Sessão persistente, pílula e "concluído" continuam.
- [ ] Faixa do cliente, Drive, "Vincular Análise" com seleção múltipla e selo "Vinculado".
- [ ] Mesmos descontos encontrados, nos extratos de teste (`AW-FINDER/tests/fixtures` + extratos reais do escritório).

---

## 8. Achados que pedem decisão

1. **"Não ajuizável" nativo.** A versão-base mais nova tem, dentro do próprio
   Finder, o botão de marcar rubrica como não ajuizável (`rubricasAnuladas`,
   motivos "já ajuizada" e "cliente não quer"). O ME faz isso por fora, no popup
   da análise comercial. Proposta: migrar primeiro **sem ligar** o nativo, para
   não mudar o fluxo de ninguém; unificar depois.
2. **Rubricas não reembolsáveis ficam fora do popup.** O popup lê `grouped` como
   lista, mas o Finder manda objeto. Resultado: hoje o "Invest Fácil" (prática
   abusiva, não reembolsável) não aparece para ser marcado, embora o comentário
   do código diga que deveria. Na migração: manter como está ou corrigir.
3. **Versões do leitor de extrato.** A base mais nova pode achar descontos um
   pouco diferentes do pacote atual. Só os extratos de teste dizem. Diferença
   encontrada vira decisão, não surpresa.

---

## 9. Segurança (descoberto no levantamento)

Por causa da chave pública dentro do pacote, o banco tem hoje:

- `clientes`: **qualquer um com a chave pública lê e altera todos os clientes**
  (`clientes_anon_select` e `clientes_anon_update`, ambas `true`). A chave pública
  está no repositório, que é público no GitHub.
- `demandas`: inserção e leitura de `analise_vinculada` e `analise_documental` por `anon`.
- Storage `analises-vinculadas`: envio por `anon` e leitura pública.
- `list-drive-files` e `fetch-drive-file` não conferem quem chama.

O Finder dentro do AW usa o login de quem está usando, então essas portas podem
fechar quando **nada mais** depender delas. O Writer também usa a chave pública
(`public/writer-app/src/clientes-supabase.js`) e precisa ser conferido antes.

---

## 10. Ordem segura da migração

1. Trazer o código-base para `src/apps/finder/` (cópia oficial do ME), como tela normal, igual ao AW-ECO faz em `src/pages/apps/Finder.tsx`.
2. Reconstruir a camada do ME (seções 3.1, 4.3, 4.4) a partir do pacote, agora com o login do usuário.
3. Religar as peças da seção 5 falando direto com o componente (sem iframe, sem ler DOM).
4. Rodar os extratos de teste nas duas versões e comparar (seção 7).
5. Só então trocar a rota `/finder` para a versão nova. O pacote antigo fica guardado até a conferência com uso real.
6. Fechar as portas da seção 9 que ficarem sem uso.

Números do banco em 25/09, para comparar depois: 14 análises comerciais (3
ligadas a conversa), 256 `analise_vinculada`, 147 `analise_documental`, 91
clientes com análise comercial, 305 planilhas no bucket `analises-vinculadas`.

---

## 11. Estado da migração (25/09)

**O Finder novo existe e está atrás de um interruptor.** Código em
`src/apps/finder/` (cópia oficial do ME; não sincroniza com o AW-ECO nem com o
AW-FINDER). O antigo, em `public/finder-app/`, continua sendo o padrão.

- Ligar no seu navegador: abrir `/finder?nativo=1` uma vez. Desligar: `/finder?nativo=0`.
- Tornar o novo o padrão para todos: `PADRAO = true` em `src/lib/finderNativo.ts`.

| Peça | Onde ficou no Finder novo |
|---|---|
| Leitor de extrato, revisor, bancos | `src/apps/finder/parser.js`, `reviewer.js`, `banks/` (da base, sem mudança de lógica) |
| Tela e visual do ME | `src/apps/finder/App.jsx` (cores do AW por variável; estilos presos a `.aw-finder`) |
| Faixa do cliente, Drive, Vincular Análise, selo Vinculado | `App.jsx` + `src/apps/finder/vincular.jsx`, reconstruídos do pacote |
| Banco (sem chave no código) | `src/apps/finder/ponteAw.ts`, com o login de quem usa |
| Entradas e saídas | props de `App` (contexto, arquivosIniciais, anuladasIniciais, onLiberarAnulada, onAnalisePronta, onReset) em vez de endereço, eventos na janela e campo de envio |
| Carregamento | `src/components/FinderNativo.tsx` (sob demanda) |
| Modo solto, conversa e refazer | `src/pages/Finder.tsx` |
| Modo cliente (sessão persistente) | `src/components/PersistentFinderHost.tsx` |
| OCR | `public/tesseract/por.traineddata` |

**Decisões aplicadas (25/09):**
- O "não ajuizável" é o cadeado nativo do cartão (motivos: já ajuizada, cliente não quer, rubrica inválida). As bloqueadas no comercial abrem já marcadas; liberar uma grava na ficha do cliente. A janela da análise comercial passa a só mostrar e salvar.
- Invest Fácil e outras não reembolsáveis agora entram na análise comercial, **já bloqueadas** (rubrica inválida): aparecem para registro e não viram ação no fechamento, que conta toda rubrica não bloqueada.
- Textos com travessão reescritos (regra da casa). Os nomes das rubricas não mudaram.

**Conferido:**
- Os 10 extratos de teste (`AW-FINDER/tests/fixtures`, 2 escaneados) dão resultado idêntico no pacote e no novo: titular, banco, conta, período, categorias, quantidades e valores.
- No AW com o banco simulado: modo cliente (Drive, Vincular com planilha e demanda no formato da seção 4.3, bloqueada do comercial aberta como não ajuizável), modo solto (análise comercial), modo conversa (PDF entregue, análise gravada com `conversa_id`), refazer (`fn_editar_analise_comercial`). Tema escuro e Off-White.

**Saguão refeito (26/09).** A tela de envio, a análise em andamento e o
desfecho são agora `src/apps/finder/Saguao.tsx`, no padrão visual do AW
(tokens, componentes, lucide, framer), sem inversão de tema. A análise tem
barra de progresso real: página a página de cada extrato (inclusive OCR),
lote a lote do auditor de IA (`refineWithLLM(..., { onProgress })`) e etapa a
etapa. A tela de resultados segue a antiga, em `.aw-finder-legado`.

**Falta, na ordem:**
1. Conferência com extratos reais do escritório e uso real com `?nativo=1`.
2. Virar o padrão e apagar `public/finder-app/`.
3. Fechar as portas da seção 9 (antes, tirar a chave pública do Writer).
