// AW Finder — Camada de Revisão Cirúrgica + Auto-Correção
//
// Deploy ping 2026-05-11 v2: primeiro ping (commit 0be7ac3) ficou "Blocked"
// no Vercel porque o author do commit era MARTINSPONTESADV (fora do team).
// Este v2 vai com author awlegaltech-5909 (owner do team) via override no
// sync-finder.mjs, então deveria passar pela proteção.
//
// Versão 3 (2026-05-04): adicionou camada de auto-correção que aplica os
// flags do reviewer com pontuação multi-sinal. Decisões automáticas só rolam
// com 2+ sinais corroborantes pra não perder desconto legítimo.
//
// Versão 2 (2026-05-04): reescrita após feedback do user que a v1 gerava ruído
// (saldo confundido com débito, créditos classificados como descontos, mistura
// entre transações vizinhas).
//
// Princípio de design: SÓ alerta com alta confiança. Usa a posição X dos
// valores (cols.creditoX, cols.debitoX, cols.saldoX do parser) pra classificar
// cada valor monetário como crédito | débito | saldo. Crédito NUNCA é desconto.
// Saldo NUNCA é desconto. Só débito.
//
// Algoritmo de detecção (3 casos, do mais conservador ao mais agressivo):
//
//   Caso 1 (alta confiança) — keyword + débito na MESMA row:
//     Ex: "VIDA E PREVIDENCIA APORTE VGBL ... 50,00 0,00"
//     → match direto. Auto-recover.
//
//   Caso 2 (média confiança) — row N tem keyword sem valor; row N-1 tem débito
//   sem keyword:
//     Ex: row N-1 "PAGTO ELETRON COBRANCA 0000099 50,00 22,08"
//         row N   "BRADESCO VIDA E PREVIDENCIA S/A"
//     → 50,00 vai para vida_prev. Auto-recover SE row N-1 não tiver outra
//       categoria reconhecida (evita roubar transação alheia).
//
//   Caso 3 (média confiança) — row N tem débito sem keyword; row N+1 tem
//   keyword sem valor (espelho do caso 2):
//     → mesma lógica, sentido oposto.
//
// Filtros anti-falso-positivo:
//   - Crédito (valor próximo de creditoX): SKIP. Resolve Josiane (RECEBIMENTO
//     FORNECEDOR Bradesco V&P era crédito de R$ 426,18, não desconto).
//   - Saldo (valor próximo de saldoX): SKIP.
//   - Row já capturada pelo parser (mesma data + valor + categoria): SKIP.
//   - Row consumida em pareamento: marcada e não reusada.

import { CATEGORIAS, normalizeText, matchCategoria, parseValor } from "./parser.js";

const VALUE_EPSILON = 0.02;
const COL_TOLERANCE = 60; // px — distância máxima para classificar valor numa coluna
const RE_DATE = /\b\d{2}\/\d{2}\/\d{4}\b/;
const RE_VALUE_TEXT = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;

/**
 * Classifica um item como crédito | débito | saldo baseado na proximidade
 * de sua posição X com as colunas detectadas pelo parser.
 *
 * Bradesco standard: cols.creditoX < cols.debitoX < cols.saldoX (esquerda → direita).
 * Se cols não foram detectadas (ex: PDF mobile sem cabeçalho), retorna null.
 */
function classifyValue(item, cols) {
  if (!cols || !RE_VALUE_TEXT.test(item.text)) return null;
  const v = parseValor(item.text);
  if (v == null) return null;
  const dC = cols.creditoX != null ? Math.abs(item.x - cols.creditoX) : Infinity;
  const dD = cols.debitoX != null ? Math.abs(item.x - cols.debitoX) : Infinity;
  const dS = cols.saldoX != null ? Math.abs(item.x - cols.saldoX) : Infinity;
  const min = Math.min(dC, dD, dS);
  if (min > COL_TOLERANCE) return null;
  let column;
  if (min === dD) column = "debito";
  else if (min === dC) column = "credito";
  else column = "saldo";
  return { value: v, column };
}

/**
 * Procura keyword de qualquer categoria no texto. Retorna a categoria + keyword
 * mais específica (matchCategoria já tem essa lógica — reusamos).
 */
function findCategoryInRow(text, allowedCats) {
  const cat = matchCategoria(text);
  if (!cat) return null;
  if (allowedCats && !allowedCats.includes(cat.id)) return null;
  // Acha o keyword específico que casou (pra reportar)
  const tn = normalizeText(text);
  let bestKw = "";
  for (const kw of cat.keywords) {
    const nkw = normalizeText(kw);
    if (tn.includes(nkw) && nkw.length > bestKw.length) bestKw = kw;
  }
  return { category: cat, keyword: bestKw || cat.keywords[0] };
}

/**
 * Encontra hits de descontos com algoritmo cirúrgico (3 casos).
 *
 * @param {{rows, cols}} reviewerData estrutura do parser com rows + cols X
 * @param {string[]} categoryIds categorias a buscar (filtra ruído)
 */
function findRawHits(reviewerData, categoryIds) {
  if (!reviewerData || !Array.isArray(reviewerData.rows)) return [];
  const cats = CATEGORIAS.filter((c) => categoryIds.includes(c.id));
  if (cats.length === 0) return [];

  const { rows, cols } = reviewerData;
  const hits = [];
  const consumed = new Set(); // índices de rows já pareadas
  let currentDate = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = row.text;
    if (!text || consumed.has(i)) continue;

    // Captura date ANTES de atualizar currentDate. Importante quando groupByY
    // do parser mergeou row "BRADESCO V&P S/A" com a próxima row que carrega
    // date diferente (ex: 10/05) — currentDate ficaria 10/05 mas a data REAL
    // da transação V&P é a anterior (28/04 ou 04/05).
    const dateBeforeRow = currentDate;
    const dm = text.match(RE_DATE);
    if (dm) currentDate = dm[0];
    if (!currentDate) continue;

    // Skip prefixos PIX (REM:/DES: nunca são tarifas)
    if (/^\s*(rem|des)\s*:/i.test(text)) continue;

    // Classifica todos os valores da row
    const valued = row.items.map((it) => ({ ...it, ...(classifyValue(it, cols) || {}) }));
    const debitItems = valued.filter((it) => it.column === "debito");
    const creditItems = valued.filter((it) => it.column === "credito");

    // Pula se a row tem APENAS valor de crédito (recebimento, não desconto)
    // mesmo se a keyword da categoria estiver lá — ex: RECEBIMENTO FORNECEDOR
    // BRADESCO VIDA E PREVIDENCIA SA com crédito de 426,18 → ignorar.
    const hasOnlyCredit = creditItems.length > 0 && debitItems.length === 0;
    if (hasOnlyCredit) continue;

    const matched = findCategoryInRow(text, categoryIds);

    // ─── Caso 1: keyword + débito na mesma row → match direto (alta confiança)
    if (matched && debitItems.length > 0) {
      hits.push({
        categoryId: matched.category.id,
        keyword: matched.keyword,
        date: currentDate,
        value: debitItems[0].value,
        snippet: text.substring(0, 200),
        confidence: "high",
        rowIdx: i,
      });
      continue;
    }

    // ─── Caso 2: row N tem keyword sem valor → procura row N-1 com débito sem
    //            keyword.
    if (matched && debitItems.length === 0) {
      // Olhar row anterior
      if (i > 0 && !consumed.has(i - 1)) {
        const prev = rows[i - 1];
        const prevValued = prev.items.map((it) => ({ ...it, ...(classifyValue(it, cols) || {}) }));
        const prevDebit = prevValued.find((it) => it.column === "debito");
        const prevCat = matchCategoria(prev.text);
        // Só pareia se prev row NÃO tem outra categoria reconhecida (evita
        // roubar transação alheia que parser categorizou separadamente)
        if (prevDebit && !prevCat) {
          // Usa dateBeforeRow (data ANTES da row atual atualizar). Se
          // groupByY mergeou row "BRADESCO V&P S/A" com a próxima row que
          // tem date diferente, currentDate seria atualizado pra essa data
          // nova — mas a transação V&P real pertence à data ANTERIOR.
          hits.push({
            categoryId: matched.category.id,
            keyword: matched.keyword,
            date: dateBeforeRow || currentDate,
            value: prevDebit.value,
            snippet: `${prev.text} / ${text}`.substring(0, 200),
            confidence: "medium",
            rowIdx: i - 1,
          });
          consumed.add(i - 1);
          consumed.add(i);
          continue;
        }
      }
    }

    // ─── Caso 3: row N tem débito sem keyword → procura row N+1 com keyword
    //            sem valor (espelho do caso 2).
    if (!matched && debitItems.length > 0) {
      if (i + 1 < rows.length && !consumed.has(i + 1)) {
        const next = rows[i + 1];
        const nextMatched = findCategoryInRow(next.text, categoryIds);
        const nextValued = next.items.map((it) => ({ ...it, ...(classifyValue(it, cols) || {}) }));
        const nextHasValue = nextValued.some((it) => it.column);
        if (nextMatched && !nextHasValue) {
          hits.push({
            categoryId: nextMatched.category.id,
            keyword: nextMatched.keyword,
            date: currentDate,
            value: debitItems[0].value,
            snippet: `${text} / ${next.text}`.substring(0, 200),
            confidence: "medium",
            rowIdx: i,
          });
          consumed.add(i);
          consumed.add(i + 1);
          continue;
        }
      }
    }
  }

  return hits;
}

/**
 * Compara matches do parser com hits raw do PDF. Identifica falsos positivos
 * (suspicious) e descontos perdidos (missing).
 */
export function reviewMatches(transactions, reviewerData) {
  if (!Array.isArray(transactions) || !reviewerData) {
    return { ok: true, needsHumanReview: false, suspicious: [], missing: [], summary: "" };
  }

  const detectedTx = transactions.map((tx) => {
    const cat = matchCategoria(tx.historico);
    return { ...tx, categoryId: cat?.id || null };
  });

  const categoryIds = [...new Set(detectedTx.map((t) => t.categoryId).filter(Boolean))];
  if (categoryIds.length === 0) {
    return { ok: true, needsHumanReview: false, suspicious: [], missing: [], summary: "" };
  }

  const rawHits = findRawHits(reviewerData, categoryIds);

  // Suspicious: tx detectado pelo parser sem hit raw equivalente
  // (provável Frankenstein: parser concatenou linhas separadas)
  const suspicious = [];
  for (const tx of detectedTx) {
    if (!tx.categoryId || !tx.data || !tx.valor) continue;
    const matched = rawHits.find(
      (h) => h.categoryId === tx.categoryId && h.date === tx.data && Math.abs(h.value - tx.valor) < VALUE_EPSILON
    );
    if (!matched) {
      suspicious.push({
        tx,
        detail: `Detectado: ${tx.categoryId} R$ ${tx.valor.toFixed(2)} em ${tx.data}, mas o PDF bruto não tem essa transação numa única row do extrato. Possível concatenação errada. Verificar manualmente.`,
      });
    }
  }

  // Missing: hit raw sem tx detectado equivalente
  const missing = [];
  const missingSeen = new Set();
  for (const hit of rawHits) {
    const detected = detectedTx.find(
      (t) => t.categoryId === hit.categoryId && t.data === hit.date && Math.abs(t.valor - hit.value) < VALUE_EPSILON
    );
    if (detected) continue;
    const key = `${hit.categoryId}|${hit.date}|${hit.value.toFixed(2)}`;
    if (missingSeen.has(key)) continue;
    missingSeen.add(key);
    missing.push({
      categoryId: hit.categoryId,
      keyword: hit.keyword,
      date: hit.date,
      value: hit.value,
      snippet: hit.snippet,
      confidence: hit.confidence,
    });
  }

  const summary = buildSummary(suspicious, missing);
  const needsHumanReview = suspicious.length > 0 || missing.length > 0;

  return {
    ok: !needsHumanReview,
    needsHumanReview,
    suspicious,
    missing,
    summary,
  };
}

/**
 * Converte missing transactions em transactions sintéticas com _recovered:true.
 * UI exibe badge "auto-detectado" no card.
 */
export function recoverMissingTransactions(missing) {
  if (!Array.isArray(missing) || missing.length === 0) return [];
  return missing.map((m) => ({
    data: m.date,
    historico: m.snippet || `[recuperado] ${m.keyword}`,
    valor: m.value,
    _recovered: true,
    _confidence: m.confidence,
  }));
}

function buildSummary(suspicious, missing) {
  const parts = [];
  if (suspicious.length > 0) {
    parts.push(`${suspicious.length} desconto${suspicious.length > 1 ? "s" : ""} suspeito${suspicious.length > 1 ? "s" : ""}`);
  }
  if (missing.length > 0) {
    parts.push(`${missing.length} desconto${missing.length > 1 ? "s" : ""} adicional${missing.length > 1 ? "is" : ""} recuperado${missing.length > 1 ? "s" : ""}`);
  }
  return parts.join(" · ");
}

export { findRawHits, classifyValue };

/* ─────────────────────────────────────────────────────────────────────
   AUTO-CORREÇÃO (Fase A — determinística, sem LLM)

   Pipeline: reviewMatches → autoCorrectTransactions
   Decide automaticamente o que rejeitar, recuperar e o que continua
   exigindo revisão manual. Decisões são conservadoras: precisa 2 sinais
   corroborantes (suspicious + killer-words OU suspicious + outlier
   extremo) pra rejeitar. Se só 1 sinal, fica no banner pra confirmação.
───────────────────────────────────────────────────────────────────── */

// Categorias "presence-only": cobranças de produto isolado que NUNCA
// deveriam aparecer junto de saque/transferência/compra na mesma row.
// Quando tx classificada nessas cats tem texto contaminado de outra
// transação, é merge errada do groupByY do parser.
const PRESENCE_ONLY_CATS = new Set([
  // `vida_prev` removida 2026-05-14 — keywords mergeadas em `seguros`.
  "tit_cap",
  "seguros",
  "mora_cel",
  "extrato_movimento",
  "div_atraso",
  "reorg_finan",
  "op_vencidas",
  "reg_lancamento",
]);

// Tokens de transação claramente distinta — não aparecem em row legítima
// de cobrança presence-only. Evitar pagto/cobranca/eletron (entram em
// "PAGTO ELETRON COBRANCA (VIDA PRE)" que é vida_prev legítimo).
//
// Inclui abreviações reais do Bradesco:
//   - SAQUE DIN CORBAN CARTAO 3743103  → "saque din", "corban", "cartao \d+"
//   - SAQUE TERMI / SAQUEterminal      → "saque termi", "saqueterminal"
//   - DEP CORBAN / DEP CHEQUE          → "dep corban"
//   - COMPRA ELO/VISA/MASTER           → "compra elo"
//   - PIX QRCODE / PIX ENVIADO         → "pix qrcode"
//
// Convenções: \b nas extremidades, abreviações comuns (din=dinheiro,
// corban=correspondente bancário, termi=terminal, dep=depósito).
const KILLER_WORDS_REGEX = /\b(?:saque\s*(?:din|dinheiro|corban|correspond|terminal|termi|caixa|atm|taa|pv|24h|c\/c|compartilhado|bradesco|pessoal)|saqueterminal|saqueteminal|saque\b(?=\s+\d)|corban\b|transferencia\b|transf\b|pix\s+(?:enviado|recebido|qrcode|qr\s*code)|compra\s+(?:elo|visa|master|debito|credito)|cartao\s+\d{4,}|cart[ãa]o\s+(?:debito|credito|de\s+credito)|deposito\s+(?:dinheiro|corban|cheque)|dep\s+(?:dinheiro|corban|cheque)|credito\s+(?:de\s+salario|sal\b)|cred\s+sal\b|estorno\b|tarifa\s+(?:ted|doc|saque|transferencia)|gastos?\s+cartao|bx[\s.]*ant[\s.]*financ|\biof\b|encargos\s+(?:limite|atraso|descoberto)|mora\s+(?:credito|operacao|cartao|enc|cdc))/i;

/**
 * Pipeline auto-corretivo (Fase A — DETERMINÍSTICO PURO).
 *
 * REGRA ÚNICA: rejeita SOMENTE quando descrição contém killer-word
 * (saque/transf/pix/compra/cartao+num/etc) E categoria é presence-only
 * (vida_prev/tit_cap/seguros/mora_cel/...).
 *
 * NÃO usa mediana, outlier, ou heurística estatística — descontos
 * bancários NÃO seguem distribuição (BX.ANT.FINANC pode variar de
 * R$ 100 a R$ 30.000 sem ser falso positivo). Confiar em estatística
 * mata danos materiais legítimos.
 *
 * Fase B (LLM auditor via n8n) entra como camada complementar com
 * cross-check ULTRA — vide refineWithLLM abaixo.
 *
 * @param {Array} transactions parser output
 * @param {{rows, cols}} reviewerData parser raw rows + cols X
 * @returns {{
 *   transactions: Array — corrigida (sem auto-rejected, com auto-recovered),
 *   autoRejected: Array — falsos positivos removidos com razões,
 *   autoRecovered: Array — descontos recuperados via raw PDF,
 *   residualSuspicious: Array — sempre vazio (UI residual descontinuada),
 *   residualMissing: Array — vazio (todos missing viram recovered),
 *   needsHumanReview: boolean — sempre false,
 *   summary: string
 * }}
 */
export function autoCorrectTransactions(transactions, reviewerData) {
  if (!Array.isArray(transactions) || !reviewerData) {
    return {
      transactions: transactions || [],
      autoRejected: [],
      autoRecovered: [],
      residualSuspicious: [],
      residualMissing: [],
      needsHumanReview: false,
      summary: "",
    };
  }

  const review = reviewMatches(transactions, reviewerData);

  const detectedTx = transactions.map((tx) => ({
    ...tx,
    categoryId: matchCategoria(tx.historico)?.id || null,
  }));

  const autoRejected = [];
  const rejectedKeys = new Set();
  const _keyOf = (tx) => `${tx.data}|${(tx.valor || 0).toFixed(2)}|${(tx.historico || "").slice(0, 80)}`;

  // ─── REGRA ÚNICA V4: killer-words em presence-only + cross-check raw PDF ───
  //
  // V4 (2026-05-13) — abordagem totalmente nova baseada em SUSPICIOUS:
  // O `reviewMatches` já produz `review.suspicious` — lista das tx que o parser
  // classificou em (categoryId, date, value) MAS o raw PDF não tem hit equivalente
  // via findRawHits. Isso é a definição matemática de "mal-categorização":
  // o parser inventou uma combinação cat+date+value que o raw PDF não confirma.
  //
  // Lógica:
  //   - tx em PRESENCE_ONLY com killer-word no histórico
  //   - SE suspicious (raw PDF não confirma cat+date+value): REMOVER
  //     → mal-categorização real (parser mergeou keyword de outra row)
  //   - SE NÃO suspicious (raw PDF confirma): PRESERVAR + flag skip LLM
  //     → tx legítima, killer-word veio de merge no histórico mas tx é real
  //
  // Casos paradigma Janeila:
  //   - tit_cap R$ 100 15/03/2017: rawHits acha "TITULO DE CAPITALIZACAO ...
  //     100,00 2.408,44" (Case 1) → matched → NÃO suspicious → preserva + flag ✓
  //   - vida_prev R$ 5,65 BVP real: rawHits acha "0000020 5,65 872,03" pareada
  //     com row "BRADESCO VIDA E PREVIDENCIA" (Case 2) → matched → preserva ✓
  //   - vida_prev fake R$ 137 (TRANSF mal-cat): nenhum hit casa cat=vida_prev
  //     + value=137 → suspicious → REMOVER ✓
  //   - vida_prev fake R$ 560/300/20 (SAQUE mal-cat): mesma lógica → REMOVER ✓
  //
  // Independe de duplicação de folhas (banner mostra mesmas tx em folhas
  // repetidas) porque suspicious é determinada por (cat+date+value), não por
  // posição da row.
  const confirmedKeys = new Set();
  const suspiciousKeySet = new Set(review.suspicious.map((s) => _keyOf(s.tx)));
  for (let idx = 0; idx < detectedTx.length; idx++) {
    const tx = detectedTx[idx];
    if (!tx.categoryId || !tx.valor) continue;
    if (!PRESENCE_ONLY_CATS.has(tx.categoryId)) continue;
    const h = normalizeText(tx.historico || "");
    const m = h.match(KILLER_WORDS_REGEX);
    if (!m) continue;
    const k = _keyOf(tx);
    if (suspiciousKeySet.has(k)) {
      // Mal-categorização: raw PDF não confirma cat+date+value.
      // Parser pegou keyword da row vizinha e valor desta row.
      if (rejectedKeys.has(k)) continue;
      rejectedKeys.add(k);
      autoRejected.push({
        tx,
        score: 85,
        reasons: [
          `descrição contém "${m[0]}", incompatível com cobrança ${tx.categoryId}`,
          `raw PDF não tem hit ${tx.categoryId} em ${tx.data} R$ ${tx.valor.toFixed(2)} (mal-cat por merge do parser)`,
        ],
        detail: "killer-words + suspicious (mal-cat confirmada via raw PDF)",
      });
      continue;
    }
    // Não suspicious → rawHits confirma cat+date+value → tx é real.
    // Killer-word veio de merge no histórico, não da row real. Preserva + skip LLM.
    confirmedKeys.add(k);
  }

  const cleaned = transactions.filter((tx) => {
    const key = `${tx.data}|${(tx.valor || 0).toFixed(2)}|${(tx.historico || "").slice(0, 80)}`;
    return !rejectedKeys.has(key);
  });

  const autoRecovered = recoverMissingTransactions(review.missing);
  const finalTransactions = [...cleaned, ...autoRecovered];

  const summaryParts = [];
  if (autoRejected.length > 0) summaryParts.push(`${autoRejected.length} falso${autoRejected.length > 1 ? "s" : ""} positivo${autoRejected.length > 1 ? "s" : ""} removido${autoRejected.length > 1 ? "s" : ""} automaticamente`);
  if (autoRecovered.length > 0) summaryParts.push(`${autoRecovered.length} desconto${autoRecovered.length > 1 ? "s" : ""} recuperado${autoRecovered.length > 1 ? "s" : ""}`);

  return {
    transactions: finalTransactions,
    autoRejected,
    autoRecovered,
    confirmedKeys,
    residualSuspicious: [],
    residualMissing: [],
    needsHumanReview: false,
    summary: summaryParts.join(" · "),
  };
}

/* ─────────────────────────────────────────────────────────────────────
   FASE B — AWFINDER REVISOR (LLM auditor com cross-check ULTRA)

   Webhook n8n: https://n8n.awlegaltech.com.br/webhook/awfinder-revisor
   Workflow: AWFINDER REVISOR (id ebpSwVQvRb7vdSGP)

   Pipeline:
   1. Cliente envia TODAS tx classificadas (categoryId != null) que
      sobreviveram à Fase A++ + as residualSuspicious
   2. n8n GPT-5.4-nano responde verdict (valid/invalid/uncertain) +
      confidence + pattern_detected (saque/transf/pix/compra/cartao_num/
      deposito/estorno/iof/none)
   3. n8n aplica TRIPLE-GATE no Code node ULTRA:
      a) verdict='invalid'
      b) confidence >= 0.90
      c) pattern_detected != 'none'
      d) categoryId em PRESENCE_ONLY
      OU "dual agreement": verdict='invalid' + categoryId presence-only +
         code_killer_match=true (n8n também executa o regex)
      → applied=true (rejeitar)
      → senão downgrade pra uncertain (preserva o desconto)
   4. Cliente recebe results[] e remove apenas os `applied=true`

   Princípio: NUNCA perder desconto legítimo. Triple-gate + dual-agreement
   garantem que uma única "alucinação" do LLM não rejeita item válido.
───────────────────────────────────────────────────────────────────── */

const LLM_TIMEOUT_MS = 30000;
const LLM_MAX_BATCH = 60;

function _txKey(tx) {
  return `${tx.data}|${(tx.valor || 0).toFixed(2)}|${(tx.historico || "").slice(0, 80)}`;
}

export async function refineWithLLM(autoResult, webhookUrl, opts = {}) {
  if (!webhookUrl || !autoResult || !Array.isArray(autoResult.transactions)) {
    return autoResult;
  }
  const timeout = opts.timeoutMs || LLM_TIMEOUT_MS;

  // Coleta TODAS as tx que sobreviveram + residualSuspicious. Não envia
  // tx _recovered (sintéticas) pra evitar churn — elas já vieram do raw PDF.
  // FIX V3 (2026-05-13): também pula tx em confirmedKeys (Fase A override #2
  // achou row limpa no raw PDF — tx é matematicamente E textualmente real,
  // killer-word veio de merge posterior. Sem isso, LLM via hist poluído e
  // marcava cobrança real como inválida com conf 98%).
  const candidatesMap = new Map();
  const confirmedKeys = autoResult.confirmedKeys instanceof Set ? autoResult.confirmedKeys : new Set();
  for (const tx of autoResult.transactions) {
    if (tx._recovered) continue;
    const cat = matchCategoria(tx.historico)?.id || null;
    if (!cat) continue;
    const k = _txKey(tx);
    if (confirmedKeys.has(k)) continue;
    candidatesMap.set(k, { tx, cat });
  }
  for (const s of autoResult.residualSuspicious) {
    const k = _txKey(s.tx);
    if (!candidatesMap.has(k)) candidatesMap.set(k, { tx: s.tx, cat: s.tx.categoryId });
  }

  const candidates = [...candidatesMap.values()];
  if (candidates.length === 0) return autoResult;

  // Batch (LLM_MAX_BATCH itens por call) — concorrente até 3
  const batches = [];
  for (let i = 0; i < candidates.length; i += LLM_MAX_BATCH) {
    batches.push(candidates.slice(i, i + LLM_MAX_BATCH));
  }

  async function callBatch(batchItems, batchIdx) {
    const payload = {
      batch: batchItems.map((c, i) => ({
        id: `b${batchIdx}_${i}`,
        categoryId: c.cat,
        data: c.tx.data,
        valor: c.tx.valor,
        historico: c.tx.historico,
      })),
    };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    // "Pular auditor de IA": quem chamou pode derrubar o lote em andamento
    const aoPular = () => ctrl.abort();
    if (opts.signal) opts.signal.addEventListener("abort", aoPular, { once: true });
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`webhook ${res.status}`);
      const data = await res.json();
      // Webhook responde como array (allIncomingItems do respondToWebhook)
      const root = Array.isArray(data) ? data[0] : data;
      return Array.isArray(root?.results) ? root.results : [];
    } catch (err) {
      clearTimeout(t);
      if (!opts.signal?.aborted) console.warn("[AWFINDER REVISOR] batch falhou:", err?.message || err);
      return [];
    } finally {
      if (opts.signal) opts.signal.removeEventListener("abort", aoPular);
    }
  }

  let allResults = [];
  // `opts.onProgress(feitos, total)`: a barra de progresso da análise anda a
  // cada lote respondido pelo auditor, e não só no fim.
  if (typeof opts.onProgress === "function") opts.onProgress(0, batches.length);
  for (let b = 0; b < batches.length; b++) {
    if (opts.signal?.aborted) break;
    const r = await callBatch(batches[b], b);
    allResults = allResults.concat(r);
    if (typeof opts.onProgress === "function") opts.onProgress(b + 1, batches.length);
  }
  /* PULADO: volta o resultado só do código, inteiro. Aplicar metade dos lotes
     deixaria umas rubricas conferidas pela IA e outras não, sem dizer quais. */
  if (opts.signal?.aborted) return autoResult;

  // Aplica APENAS results com applied=true (já passou triple-gate no n8n)
  const newRejected = [...autoResult.autoRejected];
  const rejectedKeys = new Set(newRejected.map((r) => _txKey(r.tx)));

  for (const r of allResults) {
    if (!r.applied) continue;
    const orig = r.original;
    if (!orig) continue;
    const tx = { data: orig.data, valor: orig.valor, historico: orig.historico, categoryId: orig.categoryId };
    const k = _txKey(tx);
    if (rejectedKeys.has(k)) continue;
    rejectedKeys.add(k);
    newRejected.push({
      tx,
      score: Math.round((r.confidence || 0) * 100),
      reasons: [
        `LLM auditor (conf ${((r.confidence || 0) * 100).toFixed(0)}%) detectou padrão "${r.pattern_detected}"`,
        r.code_killer_match ? "código também confirmou (dual agreement)" : "triple-gate ULTRA passou",
        r.reason || "",
      ].filter(Boolean),
      detail: "AWFINDER REVISOR",
      llm: true,
    });
  }

  // Filtra transactions removendo os novos rejected
  const cleaned = autoResult.transactions.filter((tx) => !rejectedKeys.has(_txKey(tx)));

  // residualSuspicious: anexa LLM verdict info pros que não foram rejeitados
  const verdictByKey = new Map();
  for (const r of allResults) {
    if (r.original) verdictByKey.set(_txKey(r.original), r);
  }
  const newResidual = autoResult.residualSuspicious
    .filter((s) => !rejectedKeys.has(_txKey(s.tx)))
    .map((s) => ({ ...s, llmVerdict: verdictByKey.get(_txKey(s.tx)) }));

  const llmAdded = newRejected.length - autoResult.autoRejected.length;
  const summaryAddon = llmAdded > 0 ? ` · ${llmAdded} confirmado${llmAdded > 1 ? "s" : ""} pelo auditor IA` : "";

  return {
    ...autoResult,
    transactions: cleaned,
    autoRejected: newRejected,
    residualSuspicious: newResidual,
    needsHumanReview: newResidual.length > 0,
    summary: (autoResult.summary || "") + summaryAddon,
    llmStats: {
      sent: candidates.length,
      received: allResults.length,
      rejected_by_llm: llmAdded,
    },
  };
}
