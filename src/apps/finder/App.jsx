import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { CATEGORIAS, THEME, matchCategoria, analyzeAll, parseDocumentoPDF } from "./parser.js";
import { reviewMatches, recoverMissingTransactions, autoCorrectTransactions, refineWithLLM } from "./reviewer.js";
import { PonteFinder, VincularBotao, periodoDosItens, nomeDeAba } from "./vincular.jsx";
import { SaguaoFinder } from "./Saguao.tsx";

// Fase B (AWFINDER REVISOR) — auditor IA via n8n com cross-check ULTRA.
// Workflow ebpSwVQvRb7vdSGP no n8n Oracle. Ver doc em reviewer.js.
const FINDER_LLM_URL = "https://n8n.awlegaltech.com.br/webhook/awfinder-revisor";

const fmt = (v) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Excel proíbe : \ / ? * [ ] em nomes de aba; máx 31 chars; não pode ser vazio.
// Necessário desde 2026-05-14, quando o label "Seguro / Vida e Previdência" passou a ter "/".
const sanitizeXlsSheetName = (name) => {
  const cleaned = String(name || "").replace(/[:\\/?*[\]]/g, "-").trim();
  const truncated = cleaned.slice(0, 31);
  return truncated || "Planilha";
};

/* ─────────────────────────────────────────────
   LOGO AW LEGALTECH (SVG inline, escalável)
───────────────────────────────────────────── */
function AwLogo({ size = 42, color = "hsl(var(--accent-h), var(--accent-s), calc(var(--accent-l) - 12%))" }) {
  const w = size;
  const h = Math.round(size * 0.78);
  return (
    <svg width={w} height={h} viewBox="0 0 320 250" fill={color} xmlns="http://www.w3.org/2000/svg" aria-label="AW LEGALTECH" style={{ display:"block" }}>
      {/* Letra A — dois traços inclinados formando o pico esquerdo */}
      <polygon points="20,210 95,20 130,20 55,210"/>
      <polygon points="95,20 130,20 205,210 170,210"/>
      {/* Letra W — três traços paralelos verticais (estilo monogram) */}
      <polygon points="195,20 225,20 225,210 195,210"/>
      <polygon points="240,20 270,20 270,210 240,210"/>
      <polygon points="285,20 315,20 315,210 285,210"/>
      {/* Base sólida conectando */}
      <rect x="20" y="200" width="298" height="28"/>
    </svg>
  );
}

/* ─────────────────────────────────────────────
   MODAL
───────────────────────────────────────────── */
function Modal({ group, onClose, clientName, onExported, buildSheet, loadXLSX, onExclude, onAdd, onMove, onVinculado, bancoMeta }) {
  const { cat, items } = group;
  const total = items.reduce((s, i) => s + i.valor, 0);
  const [exporting, setExporting] = useState(false);
  // Estado do form inline pra adicionar desconto manual nesta categoria
  const [showAddForm, setShowAddForm] = useState(false);
  const [addData, setAddData] = useState("");
  const [addValor, setAddValor] = useState("");
  const [addHistorico, setAddHistorico] = useState("");
  const submitAdd = () => {
    // Aceita data DD/MM/YYYY e valor com vírgula ou ponto
    const dataOk = /^\d{2}\/\d{2}\/\d{4}$/.test(addData.trim());
    const valorNum = parseFloat(addValor.replace(/\./g, "").replace(",", "."));
    if (!dataOk || !valorNum || valorNum <= 0) return;
    onAdd && onAdd(cat.id, {
      data: addData.trim(),
      valor: Math.round(valorNum * 100) / 100,
      historico: addHistorico.trim() || `[adicionado manualmente] ${cat.descricao}`,
      _manual: true,
    });
    setShowAddForm(false); setAddData(""); setAddValor(""); setAddHistorico("");
  };

  useEffect(() => {
    const fn = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const exportXLS = useCallback(async () => {
    setExporting(true);
    try {
      const XLSX = await loadXLSX();
      const ws = buildSheet(XLSX, cat, items);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sanitizeXlsSheetName(cat.label));
      const wbOut = XLSX.write(wb, { bookType:"xlsx", type:"array" });
      const blob = new Blob([wbOut], { type:"application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "AW FINDER - Tabela de Descontos.xlsx";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onExported && onExported(cat.id);
    } catch (e) { console.error("[exportXLS:Modal]", e); }
    finally { setExporting(false); }
  }, [items, cat, buildSheet, loadXLSX]);

  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,zIndex:1000,background:"var(--aw-card)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"1.5rem",animation:"mFadeIn 0.18s ease" }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%",maxWidth:760,maxHeight:"88%",background:"rgba(12,10,18,0.97)",border:`1px solid ${cat.border}`,borderRadius:16,overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:`0 0 80px ${cat.glow},0 40px 80px rgba(0,0,0,0.7)`,animation:"mSlideUp 0.22s cubic-bezier(0.4,0,0.2,1)" }}>
        <div style={{ padding:"1.4rem 1.8rem",borderBottom:"1px solid rgba(255,255,255,0.06)",background:cat.gradient,display:"flex",alignItems:"center",justifyContent:"space-between",gap:"1rem",flexWrap:"wrap" }}>
          <div style={{ display:"flex",alignItems:"center",gap:"1rem" }}>
            <div style={{ width:44,height:44,borderRadius:10,background:"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.1)",border:`1px solid ${cat.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:cat.color,fontFamily:"Inter,sans-serif",boxShadow:`0 0 18px ${cat.glow}` }}>!</div>
            <div>
              <div style={{ fontWeight:700,fontSize:"1.05rem",color:"var(--aw-text)",fontFamily:"Inter,sans-serif" }}>{cat.label}</div>
              <div style={{ fontSize:"0.75rem",color:"#64748b",marginTop:2,fontFamily:"Inter,sans-serif" }}>{items.length} lançamento{items.length!==1?"s":""} · {cat.fundamento}</div>
            </div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:"0.8rem" }}>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:"0.6rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"var(--aw-text-dim)",marginBottom:3,fontFamily:"Inter,sans-serif" }}>Total Identificado</div>
              <div style={{ fontWeight:800,fontSize:"1.35rem",color:"hsl(0 0% 95%)",letterSpacing:"-0.5px",fontFamily:"Inter,sans-serif" }}>{fmt(total)}</div>
            </div>
            {/* Vincular só esta categoria: a mesma planilha do "Extrair
                Relatório", indo para o perfil do cliente em vez do disco. */}
            <VincularBotao
              produceBlob={async () => {
                const XLSX = await loadXLSX();
                const ws = buildSheet(XLSX, cat, items);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, nomeDeAba(cat.label));
                const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
                const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                const totalValor = items.reduce((s2, it) => s2 + Math.abs(it.valor || 0), 0);
                const { dataInicio, dataFim } = periodoDosItens(items);
                return { blob, fileName: `${cat.label}.xlsx`, totalValor, qtdItens: items.length, dataInicio, dataFim };
              }}
              desconto={cat.label}
              bancoMeta={bancoMeta}
              onVinculado={onVinculado}
            />
            <button onClick={exportXLS} disabled={exporting} style={{ display:"flex",alignItems:"center",gap:7,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,color:"var(--aw-text-muted)",fontFamily:"Inter,sans-serif",fontSize:"0.7rem",fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase",padding:"8px 14px",cursor:exporting?"wait":"pointer",transition:"all 0.18s",whiteSpace:"nowrap",flexShrink:0 }}
              onMouseEnter={e=>{ if(!exporting){ e.currentTarget.style.background="rgba(34,197,94,0.1)"; e.currentTarget.style.borderColor="rgba(34,197,94,0.35)"; e.currentTarget.style.color="#4ade80"; }}}
              onMouseLeave={e=>{ e.currentTarget.style.background="rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"; e.currentTarget.style.color="var(--aw-text-muted)"; }}>
              {exporting ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation:"spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
              {exporting ? "Gerando…" : "Extrair Relatório"}
            </button>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"#64748b",width:34,height:34,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Inter,sans-serif",transition:"all 0.15s",flexShrink:0 }} onMouseEnter={e=>{e.currentTarget.style.color="var(--aw-text)";e.currentTarget.style.borderColor="rgba(255,255,255,0.2)";}} onMouseLeave={e=>{e.currentTarget.style.color="#64748b";e.currentTarget.style.borderColor="rgba(255,255,255,0.1)";}}>✕</button>
          </div>
        </div>
        <div style={{ margin:"1.2rem 1.8rem 0",padding:"0.85rem 1.1rem",background:"rgba(255,255,255,0.02)",borderRadius:8,border:"1px solid rgba(255,255,255,0.05)",borderLeft:`3px solid ${cat.color}` }}>
          <div style={{ fontSize:"0.6rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:cat.color,marginBottom:5,fontFamily:"Inter,sans-serif" }}>Fundamento Jurídico</div>
          <div style={{ fontSize:"0.82rem",color:"#64748b",lineHeight:1.65,fontFamily:"Inter,sans-serif",fontWeight:400 }}>{cat.acao}</div>
        </div>
        <div style={{ overflow:"auto",flex:1,padding:"1rem 1.8rem 1.8rem" }}>
          <table style={{ width:"100%",borderCollapse:"collapse",fontFamily:"Inter,sans-serif" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                {["Data/Ref.","Rubrica Detectada","Valor",""].map((h,i)=>(
                  <th key={i} style={{ padding:"10px 12px 12px",textAlign:i===3?"right":"left",fontSize:"0.6rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:cat.color,whiteSpace:"nowrap",width:i===3?34:undefined }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item,idx)=>{
                const bgFor = (it) => it._manual ? "rgba(34,197,94,0.04)" : (it._recovered ? "rgba(251,146,60,0.04)" : undefined);
                const bgHoverFor = (it) => it._manual ? "rgba(34,197,94,0.08)" : (it._recovered ? "rgba(251,146,60,0.08)" : "rgba(255,255,255,0.02)");
                return (
                <tr key={idx} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)",transition:"background 0.12s",background:bgFor(item) }} onMouseEnter={e=>e.currentTarget.style.background=bgHoverFor(item)} onMouseLeave={e=>e.currentTarget.style.background=bgFor(item)||"transparent"}>
                  <td style={{ padding:"11px 12px",color:"var(--aw-text-dim)",fontSize:"0.8rem",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums" }}>{item.data}</td>
                  <td style={{ padding:"11px 12px" }}>
                    <div style={{ fontWeight:600,fontSize:"0.85rem",color:"var(--aw-text)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                      {cat.descricao}
                      {item._recovered && (
                        <span title="Detectado pela camada de revisão a partir do texto raw do PDF" style={{ display:"inline-flex",alignItems:"center",gap:4,fontSize:"0.58rem",fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#fb923c",background:"rgba(251,146,60,0.12)",border:"1px solid rgba(251,146,60,0.35)",borderRadius:5,padding:"2px 7px" }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          Auto-detectado
                        </span>
                      )}
                      {item._manual && (
                        <span title="Adicionado manualmente pelo usuário" style={{ display:"inline-flex",alignItems:"center",gap:4,fontSize:"0.58rem",fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#4ade80",background:"rgba(34,197,94,0.12)",border:"1px solid rgba(34,197,94,0.35)",borderRadius:5,padding:"2px 7px" }}>+ Manual</span>
                      )}
                    </div>
                    <div style={{ fontSize:"0.72rem",color:"var(--aw-text-dim)",marginTop:2 }}>{item.historico}</div>
                  </td>
                  <td style={{ padding:"11px 12px",fontWeight:700,fontSize:"0.9rem",color:"hsl(0 0% 92%)",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums" }}>{fmt(item.valor)}</td>
                  <td style={{ padding:"6px 8px",textAlign:"right",whiteSpace:"nowrap" }}>
                    <button onClick={()=>onMove && onMove(cat.id, item)} title="Mover para outra categoria" style={{ background:"transparent",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,color:"var(--aw-text-dim)",width:24,height:24,cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",marginRight:4 }} onMouseEnter={e=>{e.currentTarget.style.color="hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)";e.currentTarget.style.borderColor="hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.4)";e.currentTarget.style.background="hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.08)";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--aw-text-dim)";e.currentTarget.style.borderColor="rgba(255,255,255,0.06)";e.currentTarget.style.background="transparent";}}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                    </button>
                    <button onClick={()=>onExclude && onExclude(cat.id, item)} title="Excluir este lançamento (falso positivo)" style={{ background:"transparent",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,color:"var(--aw-text-dim)",width:24,height:24,cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",fontSize:13 }} onMouseEnter={e=>{e.currentTarget.style.color="#f87171";e.currentTarget.style.borderColor="rgba(239,68,68,0.4)";e.currentTarget.style.background="rgba(239,68,68,0.08)";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--aw-text-dim)";e.currentTarget.style.borderColor="rgba(255,255,255,0.06)";e.currentTarget.style.background="transparent";}}>✕</button>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>

          {/* ── Form inline para adicionar desconto manualmente ── */}
          <div style={{ marginTop:14,paddingTop:14,borderTop:"1px dashed rgba(255,255,255,0.06)" }}>
            {!showAddForm ? (
              <button onClick={()=>setShowAddForm(true)} style={{ display:"inline-flex",alignItems:"center",gap:7,background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:8,color:"#4ade80",fontFamily:"Inter,sans-serif",fontSize:"0.7rem",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",padding:"7px 14px",cursor:"pointer",transition:"all 0.15s" }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(34,197,94,0.12)";}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(34,197,94,0.06)";}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Adicionar desconto manualmente
              </button>
            ) : (
              <div style={{ background:"rgba(34,197,94,0.04)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:9,padding:"14px 16px" }}>
                <div style={{ fontSize:"0.62rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#4ade80",marginBottom:10 }}>Adicionar desconto manualmente: {cat.descricao}</div>
                <div style={{ display:"grid",gridTemplateColumns:"130px 130px 1fr",gap:10,marginBottom:10 }}>
                  <input type="text" placeholder="DD/MM/AAAA" value={addData} onChange={e=>setAddData(e.target.value)} style={{ background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,color:"var(--aw-text)",fontFamily:"Inter,sans-serif",fontSize:"0.78rem",padding:"8px 10px",outline:"none" }} />
                  <input type="text" placeholder="50,00" value={addValor} onChange={e=>setAddValor(e.target.value)} style={{ background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,color:"var(--aw-text)",fontFamily:"Inter,sans-serif",fontSize:"0.78rem",padding:"8px 10px",outline:"none",fontVariantNumeric:"tabular-nums" }} />
                  <input type="text" placeholder="Histórico (ex: PAGTO BRADESCO VIDA E PREVIDÊNCIA)" value={addHistorico} onChange={e=>setAddHistorico(e.target.value)} style={{ background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,color:"var(--aw-text)",fontFamily:"Inter,sans-serif",fontSize:"0.78rem",padding:"8px 10px",outline:"none" }} />
                </div>
                <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
                  <button onClick={()=>{setShowAddForm(false);setAddData("");setAddValor("");setAddHistorico("");}} style={{ background:"transparent",border:"1px solid rgba(255,255,255,0.1)",borderRadius:7,color:"var(--aw-text-muted)",fontFamily:"Inter,sans-serif",fontSize:"0.7rem",fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",padding:"7px 14px",cursor:"pointer" }}>Cancelar</button>
                  <button onClick={submitAdd} style={{ background:"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.18)",border:"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.45)",borderRadius:7,color:"hsl(var(--accent-h) 60% 78%)",fontFamily:"Inter,sans-serif",fontSize:"0.7rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",padding:"7px 14px",cursor:"pointer" }}>Adicionar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   CATEGORY CARD
───────────────────────────────────────────── */
/* ── Rubricas não ajuizáveis (feature recuperada do ME, 11/06/2026) ──
   A atendente/advogado marca uma rubrica que NÃO entra na ação (cliente já
   entrou com essa ação por outro advogado, ou não quer ajuizar). A rubrica
   fica amarela + riscada + cadeado e SAI dos totais, da planilha e do evento
   analysis-ready (o pré-protocolo não a leva pras filas/peça). */
const MOTIVOS_ANULACAO = [
  { id: "ja_ajuizada", label: "Já ajuizada por outro advogado", sub: "Cliente já entrou com essa ação, então a rubrica não pode ser ajuizada de novo." },
  { id: "cliente_nao_quer", label: "Cliente não quer ajuizar", sub: "O cliente recusou a inclusão desta rubrica na ação." },
  /* Veio da análise comercial do ME, que já tinha este terceiro motivo: sem
     ele, uma rubrica bloqueada lá chegaria aqui com o código cru no cartão. */
  { id: "rubrica_invalida", label: "Rubrica inválida", sub: "Não é cobrança indevida de verdade: fica fora da ação." },
];
const MOTIVO_ANULACAO_LABEL = Object.fromEntries(MOTIVOS_ANULACAO.map(m => [m.id, m.label]));

function CategoryCard({ cat, items, onClick, delay, downloaded, selected, onToggleSelect, anulada, onToggleAnulada, vinculado, vinculadoCount }) {
  const [hov, setHov] = useState(false);
  const total = items.reduce((s,i)=>s+i.valor,0);
  const isAnulada = !!anulada;
  const isWarning = cat.naoReembolsavel || isAnulada;
  const accentColor = isWarning ? "#fbbf24" : cat.color;
  const accentBorder = isWarning ? "rgba(251,191,36,0.25)" : cat.border;
  const accentGlow = isWarning ? "rgba(251,191,36,0.15)" : cat.glow;
  const accentGradient = isWarning ? "linear-gradient(135deg, rgba(251,191,36,0.06), transparent 60%)" : cat.gradient;
  // Anulada: card não abre o modal de itens (não-clicável, como no original)
  const abrir = isAnulada ? undefined : onClick;
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{ background:"var(--aw-card-2)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:`1px solid ${selected?"hsl(var(--accent-h), var(--accent-s), var(--accent-l))":hov?accentColor:accentBorder}`,borderRadius:12,padding:"1.1rem 1.6rem",cursor:"pointer",transition:"all 0.22s cubic-bezier(0.4,0,0.2,1)",boxShadow:selected?`0 0 24px hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.25),inset 0 1px 0 rgba(255,255,255,0.05)`:hov?`0 0 36px ${accentGlow},0 8px 28px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.05)`:"0 2px 12px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.03)",transform:hov?"translateY(-2px)":"translateY(0)",position:"relative",overflow:"hidden",animation:`cIn 0.38s ease ${delay}s both`,fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",gap:"1.4rem" }}>
      <div style={{ position:"absolute",inset:0,background:accentGradient,opacity:hov?1:0.5,transition:"opacity 0.22s",borderRadius:12,pointerEvents:"none" }}/>
      <div style={{ position:"absolute",right:-24,top:"50%",transform:"translateY(-50%)",width:70,height:70,borderRadius:"50%",background:accentColor,opacity:hov?0.14:0.05,filter:"blur(24px)",transition:"opacity 0.3s",pointerEvents:"none" }}/>
      {/* Checkbox (anulada não entra em extração em lote) */}
      <div onClick={e=>{e.stopPropagation();if(!isAnulada&&onToggleSelect)onToggleSelect(cat.id);}} style={{ position:"relative",zIndex:1,flexShrink:0,width:22,height:22,borderRadius:5,background:selected?"hsl(var(--accent-h), var(--accent-s), var(--accent-l))":"rgba(255,255,255,0.04)",border:selected?"1px solid hsl(var(--accent-h), var(--accent-s), var(--accent-l))":"1px solid rgba(255,255,255,0.15)",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.18s",cursor:isAnulada?"not-allowed":"pointer",opacity:isAnulada?0.35:1 }}>
        {selected && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
      </div>
      <div onClick={abrir} style={{ position:"relative",zIndex:1,flexShrink:0,width:40,height:40,borderRadius:9,background:isWarning?"rgba(251,191,36,0.08)":"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.08)",border:`1px solid ${hov?accentColor:isWarning?"rgba(251,191,36,0.2)":"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.2)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:accentColor,fontFamily:"Inter,sans-serif",boxShadow:hov?`0 0 12px ${accentGlow}`:"none",transition:"all 0.22s" }}>{isAnulada?"🔒":isWarning?"⚠":"!"}</div>
      <div onClick={abrir} style={{ position:"relative",zIndex:1,flex:1,minWidth:0 }}>
        <div style={{ fontWeight:700,fontSize:"0.92rem",color:isAnulada?"var(--aw-text-muted)":"var(--aw-text)",letterSpacing:"-0.2px",marginBottom:2,display:"flex",alignItems:"center",gap:7,textDecoration:isAnulada?"line-through":"none",textDecorationColor:"rgba(251,191,36,0.55)",textDecorationThickness:2 }}>{cat.label}
          {/* JÁ VINCULADO a este cliente: a corrente verde, com a contagem
              quando foi vinculado mais de uma vez */}
          {vinculado && (
            <span title={vinculadoCount>1?`Vinculado ${vinculadoCount} vezes a este cliente`:"Vinculado ao cliente"} style={{ position:"relative",display:"inline-flex",alignItems:"center",flexShrink:0,textDecoration:"none" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              {vinculadoCount>1 && <span style={{ position:"absolute",top:-6,right:-10,minWidth:16,height:16,padding:"0 4px",borderRadius:10,background:"#10b981",color:"#0a1a14",fontSize:9.5,fontWeight:900,fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 8px rgba(16,185,129,0.6)",border:"1.5px solid #050208",lineHeight:1 }}>{vinculadoCount}</span>}
            </span>
          )}
        </div>
        <div style={{ fontSize:"0.72rem",color:"var(--aw-text-dim)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{isAnulada?(MOTIVO_ANULACAO_LABEL[anulada]||anulada):cat.sublabel}</div>
      </div>
      {isAnulada && (
        <div style={{ position:"relative",zIndex:1,flexShrink:0,display:"flex",alignItems:"center",gap:5,background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.35)",borderRadius:20,padding:"4px 11px",fontSize:"0.62rem",fontWeight:800,color:"#fbbf24",whiteSpace:"nowrap",letterSpacing:"0.5px" }}>
          🔒 NÃO AJUIZÁVEL
        </div>
      )}
      <div onClick={abrir} style={{ position:"relative",zIndex:1,flexShrink:0,background:"rgba(255,255,255,0.05)",border:`1px solid ${accentBorder}`,borderRadius:20,padding:"4px 12px",fontSize:"0.68rem",fontWeight:700,color:accentColor,whiteSpace:"nowrap" }}>{items.length} ocorr.</div>
      {downloaded && (
        <div style={{ position:"relative",zIndex:1,flexShrink:0,display:"flex",alignItems:"center",gap:5,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)",borderRadius:20,padding:"4px 11px",fontSize:"0.65rem",fontWeight:700,color:"#4ade80",whiteSpace:"nowrap" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Baixado
        </div>
      )}
      <div onClick={abrir} style={{ position:"relative",zIndex:1,flexShrink:0,width:1,height:32,background:"rgba(255,255,255,0.06)" }}/>
      <div onClick={abrir} style={{ position:"relative",zIndex:1,flexShrink:0,textAlign:"right" }}>
        <div style={{ fontSize:"0.55rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"var(--aw-text-dim)",marginBottom:3 }}>Valor</div>
        <div style={{ fontWeight:800,fontSize:"1.25rem",color:isAnulada?accentColor:"hsl(0 0% 95%)",letterSpacing:"-0.8px",textDecoration:isAnulada?"line-through":"none",textDecorationColor:"rgba(251,191,36,0.55)" }}>{fmt(total)}</div>
        {cat.naoReembolsavel && !isAnulada && <div style={{ fontSize:"0.55rem",fontWeight:700,color:"#fbbf24",letterSpacing:"0.5px",marginTop:2 }}>NÃO REEMBOLSÁVEL</div>}
        {isAnulada && <div style={{ fontSize:"0.55rem",fontWeight:700,color:"#fbbf24",letterSpacing:"0.5px",marginTop:2 }}>FORA DA AÇÃO</div>}
      </div>
      {/* Botão cadeado: marcar/cancelar inviabilidade (feature ME recuperada) */}
      {onToggleAnulada && (
        <button
          onClick={e=>{e.stopPropagation();onToggleAnulada();}}
          title={isAnulada?"Cancelar inviabilidade":"Marcar como não ajuizável (cliente já entrou com essa ação / não quer ajuizar)"}
          style={{ position:"relative",zIndex:2,flexShrink:0,width:30,height:30,borderRadius:"50%",background:isAnulada?"rgba(251,191,36,0.14)":"rgba(255,255,255,0.03)",border:`1px solid ${isAnulada?"rgba(251,191,36,0.5)":"rgba(255,255,255,0.1)"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all 0.2s",padding:0 }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#fbbf24";e.currentTarget.style.boxShadow="0 0 12px rgba(251,191,36,0.25)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=isAnulada?"rgba(251,191,36,0.5)":"rgba(255,255,255,0.1)";e.currentTarget.style.boxShadow="none";}}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isAnulada?"#fbbf24":"#64748b"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {isAnulada
              ? <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>
              : <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></>}
          </svg>
        </button>
      )}
      {!isAnulada && <div onClick={abrir} style={{ position:"relative",zIndex:1,flexShrink:0,width:30,height:30,borderRadius:"50%",background:hov?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.03)",border:`1px solid ${hov?accentColor:"rgba(255,255,255,0.07)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:hov?accentColor:"var(--aw-text-dim)",transition:"all 0.22s",transform:hov?"rotate(-45deg)":"rotate(0)" }}>→</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ANALYTICS DASHBOARD
───────────────────────────────────────────── */
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Cell, PieChart, Pie } from "recharts";

const CHART_COLORS = ["hsl(var(--accent-h), var(--accent-s), var(--accent-l))","hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)","#d8b4fe","#e9d5ff","#f3e8ff"];
const WARM_COLORS = ["#ef4444","#f97316","#fbbf24","#fbbf24","#dc2626","#fb923c","#fbbf24"];

function SectionLabel({ children }) {
  return (
    <div style={{ display:"flex",alignItems:"center",gap:8,margin:"2.2rem 0 1.1rem" }}>
      <span style={{ fontSize:"0.62rem",fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"var(--aw-text-dim)",fontFamily:"Inter,sans-serif" }}>{children}</span>
      <div style={{ flex:1,height:1,background:"rgba(255,255,255,0.05)" }}/>
    </div>
  );
}

function InsightCard({ label, value, sub, icon, accent="hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)", delay=0 }) {
  return (
    <div style={{ background:"var(--aw-card-2)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"1.1rem 1.3rem",position:"relative",overflow:"hidden",animation:`cIn 0.4s ease ${delay}s both`,flex:1,minWidth:160 }}>
      <div style={{ position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg, ${accent}, transparent)`,borderRadius:"12px 12px 0 0" }}/>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
        <div style={{ fontSize:"0.6rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"var(--aw-text-dim)",fontFamily:"Inter,sans-serif" }}>{label}</div>
        <div style={{ width:28,height:28,borderRadius:7,background:"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.08)",border:"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.15)",display:"flex",alignItems:"center",justifyContent:"center" }}>{icon}</div>
      </div>
      <div style={{ fontSize:"1.5rem",fontWeight:800,color:accent,letterSpacing:"-0.8px",lineHeight:1,marginBottom:5,fontFamily:"Inter,sans-serif" }}>{value}</div>
      <div style={{ fontSize:"0.7rem",color:"var(--aw-text-dim)",fontFamily:"Inter,sans-serif",lineHeight:1.5 }}>{sub}</div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"rgba(12,10,18,0.97)",border:"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.25)",borderRadius:8,padding:"0.7rem 1rem",fontFamily:"Inter,sans-serif",boxShadow:"0 8px 32px rgba(0,0,0,0.5)" }}>
      <div style={{ fontSize:"0.72rem",fontWeight:700,color:"var(--aw-text-muted)",marginBottom:6 }}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{ fontSize:"0.85rem",fontWeight:700,color:"hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)" }}>{typeof p.value==="number"?p.value.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):p.value}</div>)}
    </div>
  );
};

const CustomCountTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"rgba(12,10,18,0.97)",border:"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.25)",borderRadius:8,padding:"0.7rem 1rem",fontFamily:"Inter,sans-serif",boxShadow:"0 8px 32px rgba(0,0,0,0.5)" }}>
      <div style={{ fontSize:"0.72rem",fontWeight:700,color:"var(--aw-text-muted)",marginBottom:6 }}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{ fontSize:"0.85rem",fontWeight:700,color:"hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)" }}>{p.value} lançamento{p.value!==1?"s":""}</div>)}
    </div>
  );
};

function AnalyticsDashboard({ groups, meta, totalValor, totalOcorrencias }) {
  const reemb = groups.filter(g => !g.cat.naoReembolsavel);
  const allItems = reemb.flatMap(g => g.items.map(it => ({ ...it, cat: g.cat })));
  const byCategory = reemb.map(g => ({ name:g.cat.label.replace(" de ","\nde "), shortName:g.cat.label.split(" ")[0], valor:parseFloat(g.items.reduce((s,i)=>s+i.valor,0).toFixed(2)), ocorrencias:g.items.length })).sort((a,b)=>b.valor-a.valor);
  const monthly = {};
  for (const item of allItems) {
    const parts = (item.data || "").split("/");
    if (parts.length===3) {
      const key=`${parts[2]}-${parts[1]}`, label=`${parts[1]}/${parts[2]}`;
      if (!monthly[key]) monthly[key]={ key, label, valor:0, ocorrencias:0 };
      monthly[key].valor = parseFloat((monthly[key].valor+item.valor).toFixed(2));
      monthly[key].ocorrencias += 1;
    }
  }
  const timeline = Object.values(monthly).sort((a,b)=>a.key.localeCompare(b.key));
  const avgPerOccurrence = totalValor/allItems.length;
  const donutData = groups.map(g=>({ name:g.cat.label, value:parseFloat(g.items.reduce((s,i)=>s+i.valor,0).toFixed(2)) })).sort((a,b)=>b.value-a.value);
  const glassCard = { background:"var(--aw-card-2)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"1.4rem 1.6rem",backdropFilter:"blur(12px)" };
  const clientName = meta?.clientName || "CLIENTE";
  const banco = meta?.banco || "BANCO";
  const dobro = totalValor * 2;
  const topCats = byCategory.slice(0, 8);
  const maxCatVal = topCats[0]?.valor || 1;

  return (
    <div style={{ marginTop:"2.5rem" }}>

      {/* ══════ HERO PUNCH ══════ */}
      <div style={{ background:"linear-gradient(135deg, rgba(127,29,29,0.35) 0%, rgba(153,27,27,0.15) 40%, var(--aw-card-2) 100%)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:18,padding:"2.5rem 2rem",textAlign:"center",marginBottom:"2rem",position:"relative",overflow:"hidden",animation:"cIn 0.4s ease" }}>
        <div style={{ position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:300,height:300,borderRadius:"50%",background:"rgba(239,68,68,0.08)",filter:"blur(80px)",pointerEvents:"none" }}/>
        <div style={{ position:"relative",zIndex:1 }}>
          <div style={{ display:"inline-flex",alignItems:"center",gap:8,background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:20,padding:"6px 16px",marginBottom:20 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span style={{ fontSize:"0.7rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#ef4444" }}>Alerta de Cobranças Irregulares</span>
          </div>
          <div style={{ fontSize:"1.6rem",fontWeight:800,color:"var(--aw-text)",letterSpacing:"-0.5px",marginBottom:6 }}>{clientName}</div>
          <div style={{ fontSize:"1rem",fontWeight:400,color:"var(--aw-text-muted)",marginBottom:14 }}>já perdeu</div>
          <div style={{ fontSize:"3.5rem",fontWeight:900,color:"#ef4444",letterSpacing:"-2px",lineHeight:1,marginBottom:8,textShadow:"0 0 40px rgba(239,68,68,0.5),0 0 80px rgba(239,68,68,0.2)",animation:"redPulse 2.5s ease-in-out infinite" }}>{fmt(totalValor)}</div>
          <div style={{ fontSize:"1.1rem",fontWeight:500,color:"var(--aw-text-muted)",marginBottom:24 }}>para o <span style={{ color:"#f87171",fontWeight:700 }}>{banco}</span></div>
          <div style={{ fontSize:"0.82rem",color:"#64748b",marginBottom:20 }}>
            Em <span style={{ color:"var(--aw-text)",fontWeight:700 }}>{totalOcorrencias}</span> cobranças irregulares identificadas
            {meta?.periodo && meta.periodo !== "—" && <> no período de <span style={{ color:"var(--aw-text)",fontWeight:600 }}>{meta.periodo}</span></>}
          </div>
          <div style={{ display:"inline-block",background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.3)",borderRadius:12,padding:"14px 28px" }}>
            <div style={{ fontSize:"0.6rem",fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"#4ade80",marginBottom:6 }}>Direito à Restituição em Dobro · Art. 42, CDC</div>
            <div style={{ fontSize:"2rem",fontWeight:900,color:"#4ade80",letterSpacing:"-1px" }}>{fmt(dobro)}</div>
          </div>
        </div>
      </div>

      {/* ══════ CARDS DE IMPACTO ══════ */}
      <div style={{ display:"flex",gap:"0.85rem",flexWrap:"wrap",marginBottom:"1.4rem" }}>
        <InsightCard delay={0} label="Total Cobrado Indevidamente" value={fmt(totalValor)} sub="descontado da conta sem autorização" accent="#ef4444" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} />
        <InsightCard delay={0.05} label="Cobranças Irregulares" value={`${totalOcorrencias}`} sub="lançamentos identificados no extrato" accent="#f97316" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>} />
        <InsightCard delay={0.1} label="Média por Lançamento" value={fmt(avgPerOccurrence)} sub={`sobre ${allItems.length} descontos`} accent="#fbbf24" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} />
        <InsightCard delay={0.15} label="Restituição em Dobro" value={fmt(dobro)} sub="seu direito (Art. 42, CDC)" accent="#22c55e" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} />
      </div>

      {/* ══════ TOP CATEGORIAS — RANKING HORIZONTAL ══════ */}
      <div style={{ ...glassCard,marginBottom:"1rem",borderColor:"rgba(239,68,68,0.12)" }}>
        <div style={{ fontSize:"0.7rem",fontWeight:700,color:"#ef4444",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"1.2rem",fontFamily:"Inter,sans-serif" }}>De Onde Vêm as Cobranças Irregulares</div>
        {topCats.map((c,i) => {
          const pct = ((c.valor/totalValor)*100).toFixed(1);
          const barW = Math.max((c.valor/maxCatVal)*100, 2);
          return (
            <div key={i} style={{ display:"flex",alignItems:"center",gap:12,marginBottom:10,animation:`cIn 0.35s ease ${0.05*i}s both` }}>
              <div style={{ width:24,textAlign:"right",fontSize:"0.72rem",fontWeight:800,color:"var(--aw-text-dim)",flexShrink:0 }}>{i+1}.</div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                  <span style={{ fontSize:"0.78rem",fontWeight:600,color:"var(--aw-text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{c.name.replace("\n"," ")}</span>
                  <span style={{ fontSize:"0.75rem",fontWeight:700,color:WARM_COLORS[i%WARM_COLORS.length],flexShrink:0,marginLeft:8 }}>{fmt(c.valor)} ({pct}%)</span>
                </div>
                <div style={{ width:"100%",height:6,background:"rgba(255,255,255,0.04)",borderRadius:3,overflow:"hidden" }}>
                  <div style={{ width:`${barW}%`,height:"100%",background:`linear-gradient(90deg, ${WARM_COLORS[i%WARM_COLORS.length]}, ${WARM_COLORS[(i+1)%WARM_COLORS.length]})`,borderRadius:3,transition:"width 0.6s ease" }}/>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ══════ CHARTS ══════ */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 340px",gap:"1rem",marginBottom:"1rem" }}>
        <div style={{ ...glassCard }}>
          <div style={{ fontSize:"0.7rem",fontWeight:700,color:"var(--aw-text-dim)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"1.2rem",fontFamily:"Inter,sans-serif" }}>Valor por Categoria (R$)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byCategory} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="shortName" tick={{ fill:"var(--aw-text-dim)",fontSize:11,fontFamily:"Inter,sans-serif" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:"var(--aw-text-dim)",fontSize:10,fontFamily:"Inter,sans-serif" }} axisLine={false} tickLine={false} tickFormatter={v=>`R$${v>=1000?(v/1000).toFixed(1)+"k":v}`} width={52} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill:"rgba(239,68,68,0.06)" }} />
              <Bar dataKey="valor" radius={[5,5,0,0]}>{byCategory.map((_,i)=><Cell key={i} fill={WARM_COLORS[i%WARM_COLORS.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ ...glassCard,display:"flex",flexDirection:"column" }}>
          <div style={{ fontSize:"0.7rem",fontWeight:700,color:"var(--aw-text-dim)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"1rem",fontFamily:"Inter,sans-serif" }}>Proporção por Categoria</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={donutData} cx="50%" cy="50%" innerRadius={46} outerRadius={72} paddingAngle={3} dataKey="value" strokeWidth={0}>{donutData.map((_,i)=><Cell key={i} fill={WARM_COLORS[i%WARM_COLORS.length]} />)}</Pie>
              <Tooltip formatter={(v)=>fmt(v)} contentStyle={{ background:"rgba(12,10,18,0.97)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:8,fontFamily:"Inter,sans-serif",fontSize:12 }} itemStyle={{ color:"#f87171" }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:"flex",flexDirection:"column",gap:5,marginTop:"auto" }}>
            {donutData.map((d,i)=>(
              <div key={i} style={{ display:"flex",alignItems:"center",gap:7,fontSize:"0.72rem",color:"var(--aw-text-dim)",fontFamily:"Inter,sans-serif" }}>
                <div style={{ width:8,height:8,borderRadius:2,background:WARM_COLORS[i%WARM_COLORS.length],flexShrink:0 }}/>
                <span style={{ flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{d.name}</span>
                <span style={{ color:WARM_COLORS[i%WARM_COLORS.length],fontWeight:700 }}>{fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {timeline.length>1 && (
        <div style={{ ...glassCard,marginBottom:"1rem" }}>
          <div style={{ fontSize:"0.7rem",fontWeight:700,color:"var(--aw-text-dim)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"1.2rem",fontFamily:"Inter,sans-serif" }}>Evolução Temporal dos Descontos</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={timeline}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
              <XAxis dataKey="label" tick={{ fill:"var(--aw-text-dim)",fontSize:10,fontFamily:"Inter,sans-serif" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:"var(--aw-text-dim)",fontSize:10,fontFamily:"Inter,sans-serif" }} axisLine={false} tickLine={false} tickFormatter={v=>`R$${v>=1000?(v/1000).toFixed(1)+"k":v}`} width={52} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke:"rgba(239,68,68,0.2)",strokeWidth:1 }} />
              <Line type="monotone" dataKey="valor" stroke="#ef4444" strokeWidth={2.5} dot={{ fill:"#ef4444",strokeWidth:0,r:4 }} activeDot={{ r:6,fill:"#f87171" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div style={{ ...glassCard,marginBottom:"1rem" }}>
        <div style={{ fontSize:"0.7rem",fontWeight:700,color:"var(--aw-text-dim)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"1.2rem",fontFamily:"Inter,sans-serif" }}>Frequência de Ocorrências por Categoria</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={byCategory} layout="vertical" barCategoryGap="25%">
            <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis type="number" tick={{ fill:"var(--aw-text-dim)",fontSize:10,fontFamily:"Inter,sans-serif" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="shortName" tick={{ fill:"var(--aw-text-dim)",fontSize:11,fontFamily:"Inter,sans-serif" }} axisLine={false} tickLine={false} width={72} />
            <Tooltip content={<CustomCountTooltip />} cursor={{ fill:"rgba(239,68,68,0.05)" }} />
            <Bar dataKey="ocorrencias" radius={[0,5,5,0]}>{byCategory.map((_,i)=><Cell key={i} fill={WARM_COLORS[i%WARM_COLORS.length]} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ══════ RODAPE LEGAL ══════ */}
      <div style={{ background:"var(--aw-card)",border:"1px solid rgba(255,255,255,0.04)",borderRadius:12,padding:"1.2rem 1.6rem",borderLeft:"3px solid rgba(239,68,68,0.4)" }}>
        <div style={{ fontSize:"0.65rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#ef4444",marginBottom:8 }}>Fundamentação Legal</div>
        <div style={{ fontSize:"0.78rem",color:"#64748b",lineHeight:1.7 }}>
          <strong style={{ color:"var(--aw-text-muted)" }}>Art. 42, CDC</strong>: o consumidor cobrado em quantia indevida tem direito à repetição do indébito, por valor igual ao dobro do que pagou em excesso, acrescido de correção monetária e juros legais.
        </div>
        <div style={{ fontSize:"0.78rem",color:"#64748b",lineHeight:1.7,marginTop:6 }}>
          <strong style={{ color:"var(--aw-text-muted)" }}>Art. 39, CDC</strong>: é vedado ao fornecedor de produtos ou serviços condicionar o fornecimento de produto ou serviço ao de outro produto ou serviço.
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ERROR BOUNDARY (previne tela branca no dashboard)
───────────────────────────────────────────── */
class DashboardErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ margin:"2rem 0", padding:"1.5rem", background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:12, textAlign:"center" }}>
          <p style={{ color:"#f87171", fontWeight:700, marginBottom:6 }}>Erro ao renderizar o relatório</p>
          <p style={{ color:"#64748b", fontSize:"0.82rem" }}>Tente recarregar a página. Se o problema persistir, entre em contato.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─────────────────────────────────────────────
   MAIN APP
───────────────────────────────────────────── */
/**
 * O Finder dentro do AW.
 *
 * Ele era uma página à parte num iframe e conversava com o AW por endereço,
 * eventos na janela e arquivos enfiados no campo de envio. Agora cada uma
 * dessas conversas é uma prop (contrato em docs/finder-contrato.md):
 *
 *  contexto          { clienteId, clienteNome, driveFolderId, driveUrl } no
 *                    modo cliente; nulo no Finder solto e no da conversa
 *  ponte             o que o Finder pede ao banco, com o login de quem usa
 *                    (vincular, clientes, Drive). Nenhuma chave mora aqui.
 *  arquivosIniciais  PDFs que chegam na fila ao abrir (modo conversa)
 *  anuladasIniciais  { rubrica: motivo } bloqueadas na análise comercial; já
 *                    abrem como não ajuizáveis
 *  onLiberarAnulada  (rubrica) quando alguém libera uma dessas
 *  onAnalisePronta   o antigo evento `aw-finder:analysis-ready`
 *  onReset           o antigo evento `aw-finder:reset`
 */
export default function App({
  contexto = null,
  ponte = null,
  arquivosIniciais = null,
  anuladasIniciais = null,
  onLiberarAnulada = null,
  onAnalisePronta = null,
  onReset = null,
} = {}) {
  /* Callbacks do AW por referência: a página pode mandar uma função nova a
     cada render, e ela está nas dependências do efeito que avisa a análise
     pronta. Sem a referência, avisar faria o AW re-renderizar, que mandaria
     uma função nova, que avisaria de novo: o laço infinito que o comentário
     do `groups` mais abaixo já conta que aconteceu uma vez. */
  const onProntaRef = useRef(onAnalisePronta);
  const onResetRef = useRef(onReset);
  const onLiberarRef = useRef(onLiberarAnulada);
  onProntaRef.current = onAnalisePronta;
  onResetRef.current = onReset;
  onLiberarRef.current = onLiberarAnulada;
  const clienteId = contexto?.clienteId || null;
  const clienteNome = contexto?.clienteNome || null;
  const driveFolderId = contexto?.driveFolderId || null;
  const driveUrl = contexto?.driveUrl || null;
  const ponteComCliente = useMemo(
    () => (ponte ? { ...ponte, cliente: clienteId ? { id: clienteId, nome: clienteNome } : null } : null),
    [ponte, clienteId, clienteNome],
  );


  /* ── APP STATE ── */
  const [phase, setPhase] = useState("upload");
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [fileName, setFileName] = useState("");
  const [parseProgress, setParseProgress] = useState({ page:0, total:0 });
  /* O PROGRESSO REAL da análise (ver Saguao.tsx): cada extrato com a página em
     que está, a etapa atual e os lotes do auditor de IA. */
  const [progresso, setProgresso] = useState(null);
  const mexerNoProgresso = useCallback((fn) => setProgresso(p => (p ? fn(p) : p)), []);
  const umQuadro = () => new Promise(r => setTimeout(r, 40));
  const [grouped, setGrouped] = useState({});
  const [meta, setMeta] = useState({});
  const [activeModal, setActiveModal] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadedCats, setDownloadedCats] = useState(new Set());
  const [selectedCats, setSelectedCats] = useState(new Set());
  const [batchExporting, setBatchExporting] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [multipleClientsWarning, setMultipleClientsWarning] = useState(null);
  // Titulares misturados por decisão do usuário ("Analisar mesmo assim"):
  // array de nomes -> banner de aviso persiste na tela de resultados.
  const [mixedTitulares, setMixedTitulares] = useState(null);
  // Resultados já parseados quando o conflito de titularidade foi detectado —
  // permite continuar SEM re-parsear (OCR de PDFs grandes leva 10-15 min).
  const pendingResultsRef = useRef(null);
  const [reviewReport, setReviewReport] = useState(null);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  // excludedKeys: itens que o user marcou como falso positivo manualmente (X no card).
  // manualAdditions: { [catId]: [{data, valor, historico}, ...] } adições manuais
  // do user pra descontos que o parser perdeu e o reviewer não recuperou.
  const [excludedKeys, setExcludedKeys] = useState(new Set());
  const [manualAdditions, setManualAdditions] = useState({});
  const [addingToCatId, setAddingToCatId] = useState(null); // controla modal de add manual
  const [addForm, setAddForm] = useState({ data: "", valor: "", historico: "" });
  // movingItem: item sendo movido para outra categoria. Quando set, abre modal
  // de seleção de destino. User pediu pra "juntar descontos" = mover de uma
  // categoria pra outra (ex: cobrança detectada como "outros" → mover pra "cesta").
  const [movingItem, setMovingItem] = useState(null);
  // Rubricas não ajuizáveis: {catId: {motivo}} — motivo: ja_ajuizada | cliente_nao_quer.
  // Anulada = amarela/riscada/cadeado, FORA de totais, planilha e analysis-ready.
  const [anuladas, setAnuladas] = useState({});
  const [motivoAnulacaoCat, setMotivoAnulacaoCat] = useState(null); // cat aguardando escolha de motivo
  const [cancelAnulacaoCat, setCancelAnulacaoCat] = useState(null); // cat aguardando confirmação de liberação
  // quais bloqueadas do comercial já foram aplicadas nesta análise (por nome)
  const aplicadasDoComercialRef = useRef(new Set());

  /* ── DRIVE DO CLIENTE ── os extratos da pasta do cliente entram na fila sem
     passar pelo computador: ficam só na memória da aba. */
  const [driveAberto, setDriveAberto] = useState(false);
  const [driveCarregando, setDriveCarregando] = useState(false);
  const [driveArquivos, setDriveArquivos] = useState([]);
  const [driveSel, setDriveSel] = useState(new Set());
  const [driveErro, setDriveErro] = useState("");
  const [driveBaixando, setDriveBaixando] = useState(false);
  const [driveProgresso, setDriveProgresso] = useState({ done: 0, total: 0 });

  const abrirDrive = useCallback(async () => {
    if (!driveFolderId || !ponte) return;
    setDriveAberto(true); setDriveCarregando(true); setDriveErro(""); setDriveSel(new Set());
    try {
      const lista = await ponte.listarDrive(driveFolderId, null);
      setDriveArquivos(lista);
      // o que se chama "extrato" já vem marcado: é quase sempre o que se quer
      const ehExtrato = /extrato/i;
      setDriveSel(new Set(lista.filter(f => ehExtrato.test(f.name)).map(f => f.id)));
    } catch (e) {
      setDriveErro(String(e?.message || e));
    } finally {
      setDriveCarregando(false);
    }
  }, [driveFolderId, ponte]);

  const adicionarDoDrive = useCallback(async () => {
    const escolhidos = driveArquivos.filter(f => driveSel.has(f.id));
    if (!escolhidos.length || !ponte) return;
    setDriveBaixando(true); setDriveProgresso({ done: 0, total: escolhidos.length });
    const baixados = [];
    for (let i = 0; i < escolhidos.length; i++) {
      const f = escolhidos[i];
      try { baixados.push(await ponte.baixarDrive(f.id, f.name)); }
      catch (e) { console.warn(`[drive-picker] falha ao baixar ${f.name}:`, e); }
      setDriveProgresso({ done: i + 1, total: escolhidos.length });
    }
    setDriveBaixando(false); setDriveAberto(false);
    setUploadedFiles(prev => {
      const ja = new Set(prev.map(x => x.name));
      return [...prev, ...baixados.filter(x => !ja.has(x.name))];
    });
  }, [driveArquivos, driveSel, ponte]);

  /* ── JÁ VINCULADOS ── quantas vezes cada rubrica já virou análise vinculada
     deste cliente (a corrente verde no cartão). */
  const [vinculados, setVinculados] = useState(new Map());
  const carregarVinculados = useCallback(async () => {
    if (!clienteId || !ponte) { setVinculados(new Map()); return; }
    setVinculados(await ponte.listarVinculados(clienteId));
  }, [clienteId, ponte]);
  const aoVincular = useCallback((rotulos) => {
    if (Array.isArray(rotulos) && rotulos.length > 0) {
      setVinculados(prev => {
        const n = new Map(prev);
        for (const r of rotulos) n.set(r, (n.get(r) || 0) + 1);
        return n;
      });
    }
    carregarVinculados();
  }, [carregarVinculados]);
  useEffect(() => { carregarVinculados(); }, [carregarVinculados]);

  // Helper: gera key única pra um item (pra excludedKeys)
  const itemKey = (catId, item) =>
    `${catId}|${item.data || ""}|${(item.valor || 0).toFixed(2)}|${(item.historico || "").slice(0, 40)}`;

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  const addFiles = useCallback((fileList) => {
    const pdfs = Array.from(fileList).filter(f => {
      if (f.size > MAX_FILE_SIZE) { setErrorMsg(`Arquivo "${f.name}" excede 100MB e foi ignorado.`); return false; }
      return f.type==="application/pdf" || f.name.endsWith(".pdf");
    });
    if (!pdfs.length) return;
    setUploadedFiles(prev => { const existing=prev.map(f=>f.name); return [...prev,...pdfs.filter(f=>!existing.includes(f.name))]; });
  }, []);

  const entreguesRef = useRef(null);
  useEffect(() => {
    if (!arquivosIniciais || !arquivosIniciais.length || entreguesRef.current === arquivosIniciais) return;
    entreguesRef.current = arquivosIniciais;
    addFiles(arquivosIniciais);
  }, [arquivosIniciais, addFiles]);

  const removeFile = useCallback((idx) => { setUploadedFiles(prev=>prev.filter((_,i)=>i!==idx)); }, []);

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragOver(false);
    const files = e.dataTransfer?.files || e.target?.files;
    if (files) addFiles(files);
  }, [addFiles]);

  const processFiles = useCallback(async (files) => {
    if (!files.length) return;
    setMultipleClientsWarning(null); setMixedTitulares(null); pendingResultsRef.current = null;
    setPhase("parsing"); setErrorMsg("");
    setProgresso({
      inicio: Date.now(),
      arquivos: files.map(f => ({ nome: f.name, pagina: 0, paginas: 0, ocr: false, estado: "fila" })),
      etapa: "leitura",
      auditor: { feitos: 0, total: 0 },
    });
    const noArquivo = (i, patch) => mexerNoProgresso(p => ({ ...p, arquivos: p.arquivos.map((a, j) => j === i ? { ...a, ...patch } : a) }));
    const results = [];
    for (let i=0; i<files.length; i++) {
      const file = files[i]; setFileName(file.name);
      noArquivo(i, { estado: "lendo" });
      try {
        const PARSE_TIMEOUT = 1_800_000; // 30min — OCR de PDFs grandes (45+ páginas) pode levar 10-15 min
        const result = await Promise.race([
          parseDocumentoPDF(file,(page,total,ocr)=>{ setParseProgress({page,total,ocr}); noArquivo(i, { pagina: page, paginas: total, ocr: !!ocr }); }),
          new Promise((_,reject) => setTimeout(() => reject(new Error("Timeout: processamento excedeu 10 minutos")), PARSE_TIMEOUT))
        ]);
        results.push({result,file});
        noArquivo(i, { estado: "lido" });
      } catch(err) {
        noArquivo(i, { estado: "falhou" });
        setErrorMsg(prev => prev ? prev : `Erro ao processar "${file.name}": ${err.message}`);
      }
    }
    if (!results.length) { setErrorMsg("Não foi possível processar nenhum PDF. Verifique se os arquivos são documentos válidos."); setPhase("error"); return; }
    // ── Banco não suportado ──
    const unsupportedResult = results.find(r => r.result.unsupported);
    if (unsupportedResult) {
      setErrorMsg(`O banco "${unsupportedResult.result.bankName}" ainda não é suportado pelo AW FINDER. Atualmente são suportados: Bradesco, Itaú, Santander e Agibank.`);
      setPhase("error");
      return;
    }
    const uniqueNames = [...new Set(results.map(r=>r.result.clientName).filter(n=>n&&n!=="Titular não identificado"))];
    if (uniqueNames.length>1) {
      // Guarda os resultados já parseados: se o usuário escolher "Analisar
      // mesmo assim", continuamos daqui sem pagar o OCR de novo.
      pendingResultsRef.current = results;
      setPhase("upload"); setMultipleClientsWarning({names:uniqueNames}); return;
    }
    await runAnalysis(results, null);
  }, [mexerNoProgresso]);

  // Continuação da análise (pós-guardas). `mixedNames` != null quando o
  // usuário optou por analisar extratos de titulares distintos juntos —
  // o clientName vira a lista de nomes (aparece no header e nos exports)
  // e um banner de aviso persiste nos resultados.
  const runAnalysis = useCallback(async (results, mixedNames) => {
    setMixedTitulares(mixedNames || null);
    setPhase("analyzing");
    mexerNoProgresso(p => ({ ...p, etapa: "revisao" }));
    await new Promise(r=>setTimeout(r,600));
    const allTransactions = results.flatMap(r=>r.result.transactions);
    const primary = results[0].result;
    // Merge reviewerData de todos os PDFs (rows + cols do primeiro PDF como referência)
    const reviewerData = {
      rows: results.flatMap(r => r.result.reviewerData?.rows || []),
      cols: results[0]?.result.reviewerData?.cols || {},
    };
    // Camada de revisão + auto-correção (Fase A — determinística).
    // autoCorrectTransactions roda reviewMatches internamente, decide com
    // multi-sinal (killer-words em presence-only OU suspicious + outlier
    // extremo), remove falsos positivos com score>=50 e recupera missing.
    // Itens com score baixo ficam em residualSuspicious.
    let auto = autoCorrectTransactions(allTransactions, reviewerData);
    mexerNoProgresso(p => ({ ...p, etapa: "auditor" }));
    await umQuadro();
    // Fase B: AWFINDER REVISOR audita TODAS as tx classificadas via LLM com
    // cross-check ULTRA (triple-gate no n8n). Falha silenciosa se webhook off.
    if (FINDER_LLM_URL) {
      try {
        auto = await refineWithLLM(auto, FINDER_LLM_URL, {
          onProgress: (feitos, total) => mexerNoProgresso(p => ({ ...p, auditor: { feitos, total } })),
        });
      } catch (e) { console.warn("AWFINDER REVISOR falhou:", e); }
    }
    mexerNoProgresso(p => ({ ...p, etapa: "agrupamento" }));
    await umQuadro();
    const g = analyzeAll(auto.transactions);
    mexerNoProgresso(p => ({ ...p, etapa: "fim" }));
    // reviewReport agora carrega tudo: o que foi auto-corrigido (verde) +
    // o que ainda precisa revisão (laranja).
    setReviewReport({
      autoRejected: auto.autoRejected,
      autoRecovered: auto.autoRecovered,
      suspicious: auto.residualSuspicious,
      missing: auto.residualMissing,
      needsHumanReview: auto.needsHumanReview,
      summary: auto.summary,
    });
    setReviewAcknowledged(false);
    setMeta(mixedNames && mixedNames.length > 1 ? { ...primary, clientName: mixedNames.join(" + ") } : primary);
    setGrouped(g);
    setExcludedKeys(new Set()); setManualAdditions({});
    const fileList = results.map(r=>r.file);
    setFileName(fileList.length===1?fileList[0].name:`${fileList.length} documentos analisados`);
    if (Object.keys(g).length>0) { setPhase("success"); setTimeout(()=>setPhase("results"),2200); }
    else { setPhase("noDiscount"); setTimeout(()=>setPhase("results"),3000); }
  }, [mexerNoProgresso]);

  // "Analisar mesmo assim": usuário assume a mistura de titulares (ex.: casal
  // com extratos separados, ou conferência conjunta). Continua dos resultados
  // já parseados — sem re-OCR.
  const analisarMesmoAssim = useCallback(() => {
    const results = pendingResultsRef.current;
    if (!results || !results.length) { setMultipleClientsWarning(null); return; }
    const names = multipleClientsWarning?.names || [];
    setMultipleClientsWarning(null);
    pendingResultsRef.current = null;
    runAnalysis(results, names);
  }, [multipleClientsWarning, runAnalysis]);

  const reset = useCallback(() => {
    setGrouped({}); setMeta({}); setFileName(""); setUploadedFiles([]);
    setDownloadedCats(new Set()); setSelectedCats(new Set()); setShowDashboard(false);
    setConfirmReset(false); setMultipleClientsWarning(null); setMixedTitulares(null); pendingResultsRef.current = null; setPhase("upload"); setErrorMsg("");
    setReviewReport(null); setReviewAcknowledged(false);
    setExcludedKeys(new Set()); setManualAdditions({}); setAddingToCatId(null); setAddForm({data:"",valor:"",historico:""}); setMovingItem(null);
    setAnuladas({}); setMotivoAnulacaoCat(null); setCancelAnulacaoCat(null); aplicadasDoComercialRef.current = new Set();
  }, []);

  const toggleSelectCat = useCallback((catId) => {
    setSelectedCats(prev => { const next = new Set(prev); if (next.has(catId)) next.delete(catId); else next.add(catId); return next; });
  }, []);

  const selectAllCats = useCallback(() => {
    setSelectedCats(new Set(Object.values(grouped).map(g => g.cat.id)));
  }, [grouped]);

  const clearSelection = useCallback(() => { setSelectedCats(new Set()); }, []);

  // Extrai Descrição (keyword matchada) e Operação (restante) do historico
  const extractDescricaoOperacao = useCallback((historico, cat) => {
    const h = historico.toUpperCase();
    let bestKw = "";
    for (const kw of cat.keywords) {
      const nkw = kw.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const nh = h.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (nh.includes(nkw) && nkw.length > bestKw.length) bestKw = nkw;
    }
    if (!bestKw) return { descricao: historico.toUpperCase(), operacao: "" };
    const nh = h.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const idx = nh.indexOf(bestKw.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    const remainder = historico.substring(idx + bestKw.length).trim();
    return { descricao: bestKw, operacao: remainder || "" };
  }, []);

  const loadXLSX = useCallback(async () => {
    if (!window.XLSX) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
        s.integrity = "sha384-OUW9euuUyxyHcAhTqbhI+Iyb8LMssXt/cpz0yXhs9UWG2/R/uaWdakx/4cfww7Vb";
        s.crossOrigin = "anonymous";
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return window.XLSX;
  }, []);

  const XLS_BORDER = { top:{style:"thin",color:{rgb:"000000"}}, bottom:{style:"thin",color:{rgb:"000000"}}, left:{style:"thin",color:{rgb:"000000"}}, right:{style:"thin",color:{rgb:"000000"}} };
  const XLS_HEADER = { fill:{fgColor:{rgb:"00B050"}}, font:{bold:true,color:{rgb:"FFFFFF"},sz:11}, border:XLS_BORDER, alignment:{horizontal:"center"} };
  const XLS_DATA = { fill:{fgColor:{rgb:"D6E4F0"}}, border:XLS_BORDER, font:{sz:11} };
  const XLS_VALOR = { fill:{fgColor:{rgb:"D6E4F0"}}, border:XLS_BORDER, font:{sz:11}, numFmt:'"R$ "#,##0.00' };
  const XLS_TOTAL = { fill:{fgColor:{rgb:"FFFF00"}}, font:{bold:true,sz:11}, border:XLS_BORDER };
  const XLS_TOTAL_VALOR = { fill:{fgColor:{rgb:"FFFF00"}}, font:{bold:true,sz:11}, border:XLS_BORDER, numFmt:'"R$ "#,##0.00' };
  const XLS_TITLE = { fill:{fgColor:{rgb:"1F4E79"}}, font:{bold:true,color:{rgb:"FFFFFF"},sz:12}, border:XLS_BORDER, alignment:{horizontal:"center",vertical:"center"} };
  const XLS_COLS = [{ wch: 20 }, { wch: 32 }, { wch: 42 }, { wch: 18 }];

  const applySheetStyles = useCallback((XLSX, ws, rowStyles) => {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let r = range.s.r; r <= range.e.r; r++) {
      const style = rowStyles[r];
      if (!style) continue;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
        ws[addr].s = (c === 3 && style === "data") ? XLS_VALOR
          : (c === 3 && style === "total") ? XLS_TOTAL_VALOR
          : style === "header" ? XLS_HEADER
          : style === "total" ? XLS_TOTAL
          : style === "title" ? XLS_TITLE
          : XLS_DATA;
      }
    }
  }, []);

  const sanitizeXlsCell = (v) => typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : v;

  const buildSheet = useCallback((XLSX, cat, items) => {
    const header = ["Data", "Descrição", "Operação", "Valor"];
    const rows = items.map(item => {
      const { descricao, operacao } = extractDescricaoOperacao(item.historico, cat);
      return [sanitizeXlsCell(item.data), sanitizeXlsCell(descricao), sanitizeXlsCell(operacao), item.valor];
    });
    const total = items.reduce((s, i) => s + i.valor, 0);
    const totalRow = ["VALOR TOTAL", "", "", total];
    const art42Row = ["VALOR EM DOBRO", "", "", total * 2];
    const wsData = [header, ...rows, [], totalRow, art42Row];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = XLS_COLS;
    const rowStyles = {};
    rowStyles[0] = "header";
    for (let i = 1; i <= rows.length; i++) rowStyles[i] = "data";
    rowStyles[rows.length + 2] = "total";
    rowStyles[rows.length + 3] = "total";
    applySheetStyles(XLSX, ws, rowStyles);
    return ws;
  }, [extractDescricaoOperacao, applySheetStyles]);

  const buildMultiSheet = useCallback((XLSX, groups) => {
    const wsData = [];
    const rowStyles = {};
    const merges = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const { cat, items } = groups[gi];
      const titleIdx = wsData.length;
      wsData.push([cat.label, "", "", ""]);
      merges.push({ s: { r: titleIdx, c: 0 }, e: { r: titleIdx, c: 3 } });
      rowStyles[titleIdx] = "title";
      if (gi === 0) {
        rowStyles[wsData.length] = "header";
        wsData.push(["Data", "Descrição", "Operação", "Valor"]);
      }
      for (const item of items) {
        const { descricao, operacao } = extractDescricaoOperacao(item.historico, cat);
        rowStyles[wsData.length] = "data";
        wsData.push([sanitizeXlsCell(item.data), sanitizeXlsCell(descricao), sanitizeXlsCell(operacao), item.valor]);
      }
    }
    const grandTotal = groups.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.valor, 0), 0);
    rowStyles[wsData.length] = "total";
    wsData.push(["VALOR TOTAL", "", "", grandTotal]);
    rowStyles[wsData.length] = "total";
    wsData.push(["VALOR EM DOBRO", "", "", grandTotal * 2]);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = XLS_COLS;
    ws["!merges"] = merges;
    applySheetStyles(XLSX, ws, rowStyles);
    return ws;
  }, [extractDescricaoOperacao, applySheetStyles]);

  const batchExport = useCallback(async () => {
    // Usa grouped derivado (pós-exclusões/adições) pra exportar XLSX coerente com o que está na tela
    const _liveGrouped = {};
    for (const [catId, g] of Object.entries(grouped)) {
      const filtered = g.items.filter(it => !excludedKeys.has(itemKey(catId, it)));
      const manuals = manualAdditions[catId] || [];
      const combined = [...filtered, ...manuals];
      if (combined.length > 0) _liveGrouped[catId] = { ...g, items: combined };
    }
    for (const [catId, manuals] of Object.entries(manualAdditions)) {
      if (_liveGrouped[catId] || manuals.length === 0) continue;
      const cat = CATEGORIAS.find(c => c.id === catId);
      if (cat) _liveGrouped[catId] = { cat, items: manuals };
    }
    const selected = Object.values(_liveGrouped).filter(g => selectedCats.has(g.cat.id));
    if (!selected.length) return;
    setBatchExporting(true);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.utils.book_new();
      const ws = buildMultiSheet(XLSX, selected);
      XLSX.utils.book_append_sheet(wb, ws, "Descontos Identificados");
      // Abas individuais por categoria
      const usedNames = new Set(["Descontos Identificados"]);
      for (const g of selected) {
        let name = sanitizeXlsSheetName(g.cat.label);
        if (usedNames.has(name)) {
          let suffix = 2;
          let suffixStr = ` (${suffix})`;
          while (usedNames.has(name.slice(0, 31 - suffixStr.length) + suffixStr)) {
            suffix++;
            suffixStr = ` (${suffix})`;
          }
          name = name.slice(0, 31 - suffixStr.length) + suffixStr;
        }
        usedNames.add(name);
        const catWs = buildSheet(XLSX, g.cat, g.items);
        XLSX.utils.book_append_sheet(wb, catWs, name);
      }
      const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbOut], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "AW FINDER - Tabela de Descontos.xlsx";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      for (const g of selected) setDownloadedCats(prev => new Set([...prev, g.cat.id]));
    } catch (e) { console.error("[batchExport]", e); }
    finally { setBatchExporting(false); }
  }, [grouped, excludedKeys, manualAdditions, selectedCats, loadXLSX, buildMultiSheet, buildSheet]);

  // finalGrouped: aplica exclusões manuais (excludedKeys) e adições manuais
  // (manualAdditions) ao output do parser+reviewer. Resultado é o que a UI
  // renderiza E o que vai pro relatório XLSX (export usa groups).
  const finalGrouped = useMemo(() => {
    const result = {};
    for (const [catId, g] of Object.entries(grouped)) {
      const filtered = g.items.filter(it => !excludedKeys.has(itemKey(catId, it)));
      const manuals = manualAdditions[catId] || [];
      const combined = [...filtered, ...manuals];
      if (combined.length > 0) result[catId] = { ...g, items: combined };
    }
    // Categorias só com adições manuais (caso o parser não tenha detectado nada)
    for (const [catId, manuals] of Object.entries(manualAdditions)) {
      if (result[catId] || manuals.length === 0) continue;
      const cat = CATEGORIAS.find(c => c.id === catId);
      if (cat) result[catId] = { cat, items: manuals };
    }
    return result;
  }, [grouped, excludedKeys, manualAdditions]);

  // useMemo NECESSÁRIO: `reembolsaveis` está nas deps do effect que dispara
  // "aw-finder:analysis-ready". Sem memo, cada render cria um array novo →
  // effect re-dispara → o host AW-ECO (FinderPage) faz setState ao ouvir →
  // re-render → loop infinito ("Maximum update depth exceeded").
  const groups = useMemo(() => Object.values(finalGrouped), [finalGrouped]);
  // Anuladas (não ajuizáveis) saem do conjunto "ajuizável": totais, planilha,
  // dashboard e o evento analysis-ready (pré-protocolo) ignoram todas.
  const reembolsaveis = useMemo(
    () => groups.filter(g => !g.cat.naoReembolsavel && !anuladas[g.cat.id]),
    [groups, anuladas],
  );

  // Marca a rubrica como não ajuizável (com motivo) e tira da seleção de export.
  const anularRubrica = useCallback((catId, motivo) => {
    setAnuladas(prev => ({ ...prev, [catId]: { motivo } }));
    setSelectedCats(prev => { const n = new Set(prev); n.delete(catId); return n; });
    setMotivoAnulacaoCat(null);
  }, []);
  const cancelarAnulacao = useCallback((catId) => {
    /* Liberar uma que veio BLOQUEADA DO COMERCIAL é desfazer uma decisão
       gravada na ficha do cliente, e não só desta tela: o AW grava. */
    if (anuladas[catId]?.doComercial) {
      const rotulo = groups.find(g => g.cat.id === catId)?.cat.label;
      if (rotulo && onLiberarRef.current) onLiberarRef.current(rotulo);
    }
    setAnuladas(prev => { const n = { ...prev }; delete n[catId]; return n; });
    setCancelAnulacaoCat(null);
  }, [anuladas, groups]);

  /* AS BLOQUEADAS NA ANÁLISE COMERCIAL já abrem como não ajuizáveis. Casa
     pelo nome da rubrica (sem acento, sem caixa), que é como o comercial
     grava. Cada uma é aplicada uma vez só por análise: se alguém liberar, ela
     não volta sozinha. */
  useEffect(() => {
    if (!anuladasIniciais || !groups.length) return;
    const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const porNome = new Map(Object.entries(anuladasIniciais).map(([k, v]) => [norm(k), v]));
    const novas = {};
    for (const g of groups) {
      const k = norm(g.cat.label);
      if (!porNome.has(k) || aplicadasDoComercialRef.current.has(k)) continue;
      aplicadasDoComercialRef.current.add(k);
      novas[g.cat.id] = { motivo: porNome.get(k) || "rubrica_invalida", doComercial: true };
    }
    if (Object.keys(novas).length) {
      setAnuladas(prev => ({ ...novas, ...prev }));
      setSelectedCats(prev => { const n = new Set(prev); for (const id of Object.keys(novas)) n.delete(id); return n; });
    }
  }, [anuladasIniciais, groups]);

  // Handlers passados para Modal
  const handleExcludeItem = useCallback((catId, item) => {
    const k = itemKey(catId, item);
    setExcludedKeys(prev => { const n = new Set(prev); n.add(k); return n; });
  }, []);
  const handleAddItem = useCallback((catId, item) => {
    setManualAdditions(prev => ({ ...prev, [catId]: [...(prev[catId] || []), item] }));
  }, []);
  // Mover item de uma categoria para outra: combina exclusão (na origem) +
  // adição manual (no destino). O item carrega flag _movedFrom pra UI mostrar
  // que veio de outra categoria.
  const handleMoveItem = useCallback((fromCatId, item, toCatId) => {
    if (!toCatId || fromCatId === toCatId) { setMovingItem(null); return; }
    setExcludedKeys(prev => { const n = new Set(prev); n.add(itemKey(fromCatId, item)); return n; });
    setManualAdditions(prev => ({
      ...prev,
      [toCatId]: [...(prev[toCatId] || []), { ...item, _manual: true, _movedFrom: fromCatId, _recovered: false }],
    }));
    setMovingItem(null);
  }, []);
  const totalOcorrencias = reembolsaveis.reduce((s,g)=>s+g.items.length,0);
  const totalValor = reembolsaveis.reduce((s,g)=>s+g.items.reduce((ss,i)=>ss+i.valor,0),0);

  // Porta dormente — dispara evento com os dados da análise quando pronta.
  // Host (AW-ECO wrapper) pode escutar e integrar; standalone: ninguém escuta, no-op.
  useEffect(() => {
    if (phase !== "results" || reembolsaveis.length === 0) return;
    const toISO = (dataBR) => {
      const parts = (dataBR || "").split("/");
      if (parts.length !== 3) return null;
      const [d, m, y] = parts;
      if (!d || !m || !y) return null;
      return `${y.padStart(4,"0")}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    };
    const rubricasDetalhadas = reembolsaveis.map(g => {
      const items = g.items.map(it => ({
        data: it.data,
        dataISO: toISO(it.data),
        valor: Number(it.valor) || 0,
        descricao: it.historico || "",
      }));
      const datesISO = items.map(i => i.dataISO).filter(Boolean).sort();
      const total = items.reduce((s, i) => s + i.valor, 0);
      return {
        id: g.cat.id,
        label: g.cat.label,
        total,
        dataInicioISO: datesISO.length ? datesISO[0] : null,
        dataFimISO: datesISO.length ? datesISO[datesISO.length - 1] : null,
        items,
      };
    });
    const allDatesISO = rubricasDetalhadas
      .flatMap(r => r.items.map(i => i.dataISO))
      .filter(Boolean)
      .sort();
    const periodoISO = allDatesISO.length
      ? { inicio: allDatesISO[0], fim: allDatesISO[allDatesISO.length - 1] }
      : { inicio: null, fim: null };
    const rubricas = rubricasDetalhadas.map(r => r.label);
    const buildXlsxBlob = async () => {
      try {
        const XLSX = await loadXLSX();
        const wb = XLSX.utils.book_new();
        const ws = buildMultiSheet(XLSX, reembolsaveis);
        XLSX.utils.book_append_sheet(wb, ws, "Descontos Identificados");
        const usedNames = new Set(["Descontos Identificados"]);
        for (const g of reembolsaveis) {
          let name = sanitizeXlsSheetName(g.cat.label);
          if (usedNames.has(name)) {
            let suffix = 2;
            let suffixStr = ` (${suffix})`;
            while (usedNames.has(name.slice(0, 31 - suffixStr.length) + suffixStr)) {
              suffix++;
              suffixStr = ` (${suffix})`;
            }
            name = name.slice(0, 31 - suffixStr.length) + suffixStr;
          }
          usedNames.add(name);
          const catWs = buildSheet(XLSX, g.cat, g.items);
          XLSX.utils.book_append_sheet(wb, catWs, name);
        }
        const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        return new Blob([wbOut], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      } catch (e) {
        console.error("[buildXlsxBlob]", e);
        return null;
      }
    };
    if (onProntaRef.current) {
      onProntaRef.current({
          meta,
          grouped,
          rubricas,
          rubricasDetalhadas,
          // Rubricas marcadas como NÃO ajuizáveis (fora da ação): o host pode
          // persistir na análise salva e exibir na ficha. Motivos:
          // ja_ajuizada (cliente já entrou com essa ação) | cliente_nao_quer.
          rubricasAnuladas: groups
            .filter(g => anuladas[g.cat.id])
            .map(g => ({
              id: g.cat.id,
              label: g.cat.label,
              motivo: anuladas[g.cat.id].motivo,
              total: g.items.reduce((s, i) => s + i.valor, 0),
            })),
          /* TODAS as rubricas, inclusive as não reembolsáveis (Invest Fácil)
             e as não ajuizáveis. A análise comercial precisa da lista
             inteira; `rubricasDetalhadas` só tem as que entram na ação. */
          rubricasTodas: groups.map(g => ({
            id: g.cat.id,
            label: g.cat.label,
            total: g.items.reduce((s, i) => s + i.valor, 0),
            naoReembolsavel: !!g.cat.naoReembolsavel,
            anulada: anuladas[g.cat.id]?.motivo || null,
          })),
          totalDescontos: totalValor,
          periodoISO,
          fileName,
          buildXlsxBlob,
      });
    }
  }, [phase, grouped, meta, reembolsaveis, groups, anuladas, totalValor, fileName, loadXLSX, buildMultiSheet, buildSheet]);

  useEffect(() => {
    if (phase === "upload" && Object.keys(grouped).length === 0) {
      if (onResetRef.current) onResetRef.current();
    }
  }, [phase, grouped]);

  /* Saguão (envio, análise em andamento, desfecho) é tela do AW: Saguao.tsx.
     Os resultados seguem na tela antiga do Finder, dentro de .aw-finder-legado. */
  const faseDoSaguao = ["upload","parsing","analyzing","success","noDiscount","error"].includes(phase);

  return (
    <PonteFinder.Provider value={ponteComCliente}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        /* DENTRO DO AW. Tudo o que era :root, html e body quando o Finder era
           uma página à parte vale só dentro da caixa dele: um reset de margem
           global aqui apagaria o espaçamento do resto do sistema. */
        .aw-finder{
          --bg:hsl(0 0% 3%);
          --bg-modal:hsl(0 0% 2% / 0.95);
          --bg-card:hsl(0 0% 6%);
          --bg-glass:hsl(0 0% 6% / 0.6);
          --bg-row-hover:rgba(255,255,255,0.03);
          --line-dim:rgba(255,255,255,0.04);
          --line:hsl(0 0% 14%);
          --line-bright:hsl(0 0% 20%);
          --violet:hsl(var(--accent-h) var(--accent-s) var(--accent-l));
          --violet-soft:hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 12%));
          --violet-deep:hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) - 12%));
          --violet-border:hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.35);
          --violet-border-soft:hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.18);
          --violet-bg:hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.08);
          --violet-glow:hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.35);
          --text:hsl(0 0% 98%);
          --text-dim:hsl(0 0% 65%);
          --text-mute:hsl(0 0% 50%);
          --text-faint:hsl(0 0% 38%);
          --text-ghost:hsl(0 0% 28%);
          --red:#f87171;
          --green:#4ade80;
          --amber:#fbbf24;
          --amber-soft:#fcd34d;
          --amber-border:rgba(251,191,36,0.4);
          --amber-bg:rgba(251,191,36,0.08);
          --font:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
        }
        .aw-finder-legado{
          font-family:var(--font);font-size:14px;line-height:1.5;color:var(--text);
          -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;letter-spacing:-0.01em;
        }
        /* As cores do AW que o Finder usa, no escuro. As do destaque
           (--accent-h/s/l) vêm do tema escolhido no AW. */
        .aw-finder{
          --aw-bg:hsl(0 0% 3%);
          --aw-card:hsl(0 0% 6%);
          --aw-card-2:hsl(0 0% 9%);
          --aw-border:hsl(0 0% 14%);
          --aw-border-soft:hsla(0,0%,100%,0.06);
          --aw-text:hsl(0 0% 98%);
          --aw-text-muted:hsl(0 0% 60%);
          --aw-text-dim:hsl(0 0% 40%);
          /* As janelas do Finder (categoria, Drive, cliente) ficam presas à
             área dele, como quando ele era um iframe, e não cobrem o menu. */
          contain:layout paint;
        }
        /* TEMAS CLAROS (Off-White e SEI). O Finder tem cinza-carvão escrito à
           mão em cada cartão, então ele é INVERTIDO por inteiro e o giro no
           matiz devolve verde, âmbar e vermelho, escuros e legíveis no claro.
           Os tons abaixo são escolhidos para, depois de invertidos, darem papel
           branco e borda fina. Foto e canvas invertem de volta. */
        html[data-theme="branco"] .aw-finder-legado,html[data-theme="sei"] .aw-finder-legado{
          filter:invert(1) hue-rotate(180deg);
          --bg:#000;
          --aw-bg:hsl(0 0% 0%);
          --aw-card:hsl(0 0% 2%);
          --aw-card-2:hsl(0 0% 5%);
          --aw-border:hsl(0 0% 11%);
          --aw-border-soft:hsla(0,0%,100%,0.08);
          --aw-text:hsl(0 0% 91%);
          --aw-text-muted:hsl(0 0% 60%);
          --aw-text-dim:hsl(0 0% 45%);
        }
        html[data-theme="branco"] .aw-finder-legado{--accent-s:0%;--accent-l:50%;--sat-destaque:0%}
        html[data-theme="sei"] .aw-finder-legado{--accent-l:53%}
        html[data-theme="branco"] .aw-finder-legado img,html[data-theme="branco"] .aw-finder-legado video,html[data-theme="branco"] .aw-finder-legado canvas,
        html[data-theme="sei"] .aw-finder-legado img,html[data-theme="sei"] .aw-finder-legado video,html[data-theme="sei"] .aw-finder-legado canvas{filter:invert(1) hue-rotate(180deg)}
        .aw-finder-legado *,.aw-finder-legado *::before,.aw-finder-legado *::after{box-sizing:border-box;margin:0;padding:0}
        .aw-finder-legado button{font-family:inherit;color:inherit}
        .aw-finder-legado input,.aw-finder-legado select,.aw-finder-legado textarea{font-family:inherit;color:inherit}
        .aw-finder-legado ::selection{background:hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.35);color:#fff}
        .aw-finder-legado ::-webkit-scrollbar{width:8px;height:8px}
        .aw-finder-legado ::-webkit-scrollbar-track{background:transparent}
        .aw-finder-legado ::-webkit-scrollbar-thumb{background:hsla(0,0%,22%,0.7);border-radius:4px}
        .aw-finder-legado ::-webkit-scrollbar-thumb:hover{background:hsla(0,0%,32%,0.9)}
        @keyframes mFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes mSlideUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
        @keyframes cIn{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fndPulse{0%,100%{opacity:1}50%{opacity:0.35}}
        @keyframes fadeSlide{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes checkPop{0%{transform:scale(0) rotate(-20deg);opacity:0}60%{transform:scale(1.18) rotate(4deg);opacity:1}80%{transform:scale(0.94) rotate(-2deg)}100%{transform:scale(1) rotate(0deg);opacity:1}}
        @keyframes checkRing{0%{transform:scale(0.6);opacity:0}50%{opacity:1}100%{transform:scale(1.7);opacity:0}}
        @keyframes checkFadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes xPop{0%{transform:scale(0) rotate(20deg);opacity:0}60%{transform:scale(1.15) rotate(-4deg);opacity:1}80%{transform:scale(0.96) rotate(2deg)}100%{transform:scale(1) rotate(0deg);opacity:1}}
        @keyframes xRing{0%{transform:scale(0.6);opacity:0}50%{opacity:1}100%{transform:scale(1.7);opacity:0}}
        @keyframes warnPop{0%{transform:scale(0);opacity:0}65%{transform:scale(1.12);opacity:1}100%{transform:scale(1);opacity:1}}
        @keyframes redPulse{0%,100%{transform:scale(1);text-shadow:0 0 40px rgba(239,68,68,0.5),0 0 80px rgba(239,68,68,0.2)}50%{transform:scale(1.02);text-shadow:0 0 60px rgba(239,68,68,0.7),0 0 100px rgba(239,68,68,0.35)}}
        .aw-finder-legado .kpi-featured{transition:box-shadow 0.3s ease,border-color 0.3s ease;}
        .aw-finder-legado .kpi-featured:hover{box-shadow:0 0 48px hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.55),inset 0 1px 0 rgba(255,255,255,0.06) !important;border-color:hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.75) !important;}
      `}</style>

      {/* Duas caixas: a de fora prende as janelas do Finder à área dele (e
          recebe a inversão dos temas claros); a de dentro é a que rola. Com
          uma só, uma janela aberta com a lista rolada nasceria lá no topo. */}
      <div className="aw-finder" style={{ height:"100%",position:"relative" }}>
      {faseDoSaguao ? (
        <SaguaoFinder
          fase={phase}
          clienteNome={clienteNome}
          driveFolderId={driveFolderId}
          driveUrl={driveUrl}
          arquivos={uploadedFiles}
          aviso={phase==="upload" ? errorMsg : ""}
          onAdicionar={(files)=>{ setErrorMsg(""); addFiles(files); }}
          onRemover={removeFile}
          onAnalisar={()=>processFiles(uploadedFiles)}
          progresso={progresso}
          erro={errorMsg}
          onRecomecar={()=>{ setErrorMsg(""); setPhase("upload"); }}
          quantasRubricas={Object.keys(grouped).length}
          onAbrirDrive={abrirDrive}
          drive={{ aberto: driveAberto, carregando: driveCarregando, arquivos: driveArquivos, selecionados: driveSel, erro: driveErro, baixando: driveBaixando, progresso: driveProgresso }}
          onDriveAlternar={(id)=>setDriveSel(prev=>{ const n=new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n; })}
          onDriveTodos={()=>setDriveSel(new Set(driveArquivos.map(f=>f.id)))}
          onDriveLimpar={()=>setDriveSel(new Set())}
          onDriveFechar={()=>setDriveAberto(false)}
          onDriveAdicionar={adicionarDoDrive}
          titulares={multipleClientsWarning && phase==="upload" ? multipleClientsWarning.names : null}
          onAjustarArquivos={()=>{ setMultipleClientsWarning(null); pendingResultsRef.current = null; }}
          onAnalisarMesmoAssim={analisarMesmoAssim}
        />
      ) : (
      <div className="aw-finder-legado" style={{ height:"100%",position:"relative" }}>
      <div style={{ height:"100%",overflowY:"auto",background:"var(--bg)",color:"var(--aw-text)",fontFamily:"Inter,sans-serif" }}>

        {/* HEADER */}
        {/* A faixa de cima ficou vazia de propósito: a marca e o "Motor Ativo"
            saíram quando o Finder entrou no AW (o AW já tem cabeçalho), e a
            faixa ficou como respiro entre o cabeçalho e o conteúdo. */}
        <header style={{ position:"sticky",top:0,zIndex:50,height:64,borderBottom:"1px solid rgba(255,255,255,0.04)",background:"transparent",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 2rem" }} />

        {/* DE QUEM SÃO ESTES EXTRATOS (modo cliente) */}
        {clienteNome && (
          <div style={{ padding:"10px 2rem",background:"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.08)",borderBottom:"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.20)",display:"flex",alignItems:"center",gap:10,fontSize:12,color:"hsl(0 0% 75%)",fontFamily:"Inter,sans-serif" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color:"hsl(var(--accent-h) 60% 70%)" }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>Analisando extratos para: <strong style={{ color:"hsl(0 0% 95%)",fontWeight:600 }}>{clienteNome}</strong></span>
            <span style={{ marginLeft:"auto",fontSize:11,color:"hsl(0 0% 55%)" }}>Vincule cada planilha gerada ao perfil do cliente.</span>
          </div>
        )}

        {/* ── UPLOAD ── */}
        {/* ── CONFIRM RESET ── */}
        {confirmReset && (
          <div style={{ position:"fixed",inset:0,zIndex:300,background:"var(--aw-card)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"2rem",animation:"mFadeIn 0.18s ease" }}>
            <div style={{ width:"100%",maxWidth:420,background:"rgba(12,10,18,0.97)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"2.2rem",boxShadow:"0 0 60px rgba(0,0,0,0.5)",animation:"mSlideUp 0.22s ease",textAlign:"center" }}>
              <div style={{ width:56,height:56,borderRadius:14,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 1.4rem" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--aw-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <p style={{ fontSize:"1.1rem",fontWeight:800,color:"var(--aw-text)",letterSpacing:"-0.3px",marginBottom:10,fontFamily:"Inter,sans-serif" }}>Tem certeza?</p>
              <p style={{ fontSize:"0.82rem",color:"#64748b",lineHeight:1.7,marginBottom:"1.8rem",fontFamily:"Inter,sans-serif" }}>O relatório atual será descartado e você voltará à tela inicial.</p>
              <div style={{ display:"flex",gap:"0.75rem" }}>
                <button onClick={()=>setConfirmReset(false)} style={{ flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,color:"var(--aw-text-muted)",fontFamily:"Inter,sans-serif",fontSize:"0.78rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",padding:"12px",cursor:"pointer",transition:"all 0.2s" }} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.2)";e.currentTarget.style.color="var(--aw-text)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.1)";e.currentTarget.style.color="var(--aw-text-muted)";}}>Cancelar</button>
                <button onClick={reset} style={{ flex:1,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:9,color:"#f87171",fontFamily:"Inter,sans-serif",fontSize:"0.78rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",padding:"12px",cursor:"pointer",transition:"all 0.2s" }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,0.18)";}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(239,68,68,0.1)";}}>Sim, Nova Análise</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: motivo da inviabilidade (marcar rubrica não ajuizável) ── */}
        {motivoAnulacaoCat && (
          <div style={{ position:"fixed",inset:0,zIndex:300,background:"var(--aw-card)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"2rem",animation:"mFadeIn 0.18s ease" }}>
            <div style={{ width:"100%",maxWidth:460,background:"rgba(12,10,18,0.97)",border:"1px solid rgba(251,191,36,0.25)",borderRadius:16,padding:"2.2rem",boxShadow:"0 0 60px rgba(0,0,0,0.5)",animation:"mSlideUp 0.22s ease" }}>
              <div style={{ width:56,height:56,borderRadius:14,background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.3)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 1.4rem" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <p style={{ fontSize:"1.1rem",fontWeight:800,color:"var(--aw-text)",letterSpacing:"-0.3px",marginBottom:8,fontFamily:"Inter,sans-serif",textAlign:"center" }}>Marcar como não ajuizável</p>
              <p style={{ fontSize:"0.82rem",color:"#64748b",lineHeight:1.7,marginBottom:"1.6rem",fontFamily:"Inter,sans-serif",textAlign:"center" }}>Por que <strong style={{ color:"#fbbf24" }}>{motivoAnulacaoCat.label}</strong> não entra na ação? A rubrica sai dos totais, da planilha e das filas do pré-protocolo.</p>
              <div style={{ display:"flex",flexDirection:"column",gap:"0.7rem",marginBottom:"1.4rem" }}>
                {MOTIVOS_ANULACAO.map(m => (
                  <button key={m.id} onClick={()=>anularRubrica(motivoAnulacaoCat.id, m.id)}
                    style={{ textAlign:"left",background:"rgba(251,191,36,0.05)",border:"1px solid rgba(251,191,36,0.22)",borderRadius:10,padding:"14px 16px",cursor:"pointer",transition:"all 0.18s",fontFamily:"Inter,sans-serif" }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#fbbf24";e.currentTarget.style.background="rgba(251,191,36,0.1)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(251,191,36,0.22)";e.currentTarget.style.background="rgba(251,191,36,0.05)";}}>
                    <div style={{ fontSize:"0.88rem",fontWeight:700,color:"var(--aw-text)",letterSpacing:"-0.3px",marginBottom:3 }}>{m.label}</div>
                    <div style={{ fontSize:"0.72rem",color:"var(--aw-text-muted)",lineHeight:1.5 }}>{m.sub}</div>
                  </button>
                ))}
              </div>
              <button onClick={()=>setMotivoAnulacaoCat(null)} style={{ width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,color:"var(--aw-text-muted)",fontFamily:"Inter,sans-serif",fontSize:"0.78rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",padding:"12px",cursor:"pointer",transition:"all 0.2s" }} onMouseEnter={e=>{e.currentTarget.style.color="var(--aw-text)";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--aw-text-muted)";}}>Cancelar</button>
            </div>
          </div>
        )}

        {/* ── MODAL: cancelar inviabilidade (liberar rubrica de volta) ── */}
        {cancelAnulacaoCat && (
          <div style={{ position:"fixed",inset:0,zIndex:300,background:"var(--aw-card)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"2rem",animation:"mFadeIn 0.18s ease" }}>
            <div style={{ width:"100%",maxWidth:440,background:"rgba(12,10,18,0.97)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"2.2rem",boxShadow:"0 0 60px rgba(0,0,0,0.5)",animation:"mSlideUp 0.22s ease",textAlign:"center" }}>
              <div style={{ width:56,height:56,borderRadius:14,background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.3)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 1.4rem" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
              </div>
              <p style={{ fontSize:"1.1rem",fontWeight:800,color:"var(--aw-text)",letterSpacing:"-0.3px",marginBottom:10,fontFamily:"Inter,sans-serif" }}>Cancelar inviabilidade?</p>
              <p style={{ fontSize:"0.82rem",color:"#64748b",lineHeight:1.7,marginBottom:"1.8rem",fontFamily:"Inter,sans-serif" }}>Apesar do motivo sinalizado (<strong style={{ color:"#f87171" }}>{MOTIVO_ANULACAO_LABEL[anuladas[cancelAnulacaoCat.id]?.motivo] || "sem motivo"}</strong>), a rubrica <strong style={{ color:"#fbbf24" }}>{cancelAnulacaoCat.label}</strong> voltará a contar na ação, nos totais e na planilha.</p>
              <div style={{ display:"flex",gap:"0.75rem" }}>
                <button onClick={()=>setCancelAnulacaoCat(null)} style={{ flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,color:"var(--aw-text-muted)",fontFamily:"Inter,sans-serif",fontSize:"0.78rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",padding:"12px",cursor:"pointer",transition:"all 0.2s" }} onMouseEnter={e=>{e.currentTarget.style.color="var(--aw-text)";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--aw-text-muted)";}}>Voltar</button>
                <button onClick={()=>cancelarAnulacao(cancelAnulacaoCat.id)} style={{ flex:1,background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.35)",borderRadius:9,color:"#fbbf24",fontFamily:"Inter,sans-serif",fontSize:"0.78rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",padding:"12px",cursor:"pointer",transition:"all 0.2s" }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(251,191,36,0.18)";}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(251,191,36,0.1)";}}>Sim, liberar</button>
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {phase==="results" && (
          <div style={{ maxWidth:1080,margin:"0 auto",padding:"2.5rem 2rem" }}>
            <div style={{ marginBottom:"2rem",paddingBottom:"2rem",borderBottom:"1px solid rgba(255,255,255,0.06)",animation:"fadeSlide 0.3s ease" }}>
              <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:"1rem" }}>
                <div>
                  <div style={{ fontSize:"0.6rem",fontWeight:700,letterSpacing:"3px",textTransform:"uppercase",color:"hsl(var(--accent-h), var(--accent-s), var(--accent-l))",marginBottom:10 }}>Relatório de Análise · Descontos Indevidos</div>
                  <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:10 }}>
                    <div style={{ width:40,height:40,borderRadius:"50%",background:"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.1)",border:"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.22)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <h2 style={{ fontSize:"2rem",fontWeight:900,color:"var(--aw-text)",letterSpacing:"-1px",lineHeight:1.1 }}>{meta.clientName}</h2>
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                    {[meta.banco||"Bradesco", meta.agencia?`Ag. ${meta.agencia}`:null, meta.conta?`Cta. ${meta.conta}`:null, meta.periodo&&meta.periodo!=="—"?meta.periodo:null, fileName].filter(Boolean).map((tag,i)=>(
                      <span key={i} style={{ fontSize:"0.75rem",color:"var(--aw-text-dim)",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:6,padding:"3px 10px" }}>{tag}</span>
                    ))}
                  </div>
                </div>
                <button onClick={()=>setConfirmReset(true)} style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,color:"var(--aw-text-dim)",fontFamily:"Inter,sans-serif",fontSize:"0.7rem",fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase",padding:"9px 18px",cursor:"pointer",transition:"all 0.2s",alignSelf:"flex-start" }} onMouseEnter={e=>{e.currentTarget.style.color="var(--aw-text-muted)";e.currentTarget.style.borderColor="rgba(255,255,255,0.14)";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--aw-text-dim)";e.currentTarget.style.borderColor="rgba(255,255,255,0.07)";}}>← Nova Análise</button>
              </div>
            </div>

            {/* ── BANNER ÂMBAR: titulares misturados por decisão do usuário ── */}
            {mixedTitulares && mixedTitulares.length > 1 && (
              <div style={{ marginBottom:"1rem",padding:"1.1rem 1.5rem",background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.32)",borderRadius:12,display:"flex",alignItems:"flex-start",gap:12,animation:"fadeSlide 0.35s ease" }}>
                <div style={{ flexShrink:0,width:32,height:32,borderRadius:9,background:"rgba(251,191,36,0.12)",border:"1px solid rgba(251,191,36,0.35)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <p style={{ fontSize:"0.82rem",fontWeight:700,color:"#fbbf24",fontFamily:"Inter,sans-serif",marginBottom:3 }}>Análise com titulares misturados</p>
                  <p style={{ fontSize:"0.76rem",color:"var(--aw-text-muted)",lineHeight:1.6,fontFamily:"Inter,sans-serif" }}>Este relatório consolida extratos de <strong style={{color:"var(--aw-text)"}}>{mixedTitulares.join(" e ")}</strong>. Os descontos NÃO estão separados por pessoa: confira a origem de cada lançamento antes de usar em petição.</p>
                </div>
              </div>
            )}

            {/* ── BANNER VERDE: correções automáticas aplicadas ── */}
            {reviewReport && ((reviewReport.autoRejected?.length||0) > 0 || (reviewReport.autoRecovered?.length||0) > 0) && (
              <div style={{ marginBottom: reviewReport.needsHumanReview ? "1rem" : "2rem", padding:"1.5rem 1.75rem",background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.32)",borderRadius:12,boxShadow:"0 0 24px rgba(34,197,94,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",animation:"fadeSlide 0.35s ease" }}>
                <div style={{ display:"flex",alignItems:"flex-start",gap:14,marginBottom:reviewReport.autoRejected.length||reviewReport.autoRecovered.length?14:0 }}>
                  <div style={{ flexShrink:0,width:36,height:36,borderRadius:10,background:"rgba(34,197,94,0.14)",border:"1px solid rgba(34,197,94,0.35)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:"0.6rem",fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"#22c55e",marginBottom:6 }}>Auto-correção aplicada</div>
                    <div style={{ fontSize:"0.95rem",fontWeight:700,color:"var(--aw-text)",marginBottom:4 }}>O AW Finder ajustou inconsistências automaticamente.</div>
                    <div style={{ fontSize:"0.78rem",color:"var(--aw-text-muted)",lineHeight:1.5 }}>{reviewReport.summary || "Revisão limpa."}</div>
                  </div>
                </div>

                {reviewReport.autoRejected.length > 0 && (
                  <div style={{ marginTop:14,padding:"12px 14px",background:"rgba(34,197,94,0.04)",border:"1px solid rgba(34,197,94,0.18)",borderRadius:8 }}>
                    <div style={{ fontSize:"0.62rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#86efac",marginBottom:8 }}>✓ Falsos positivos removidos ({reviewReport.autoRejected.length})</div>
                    {reviewReport.autoRejected.slice(0,5).map((r,i)=>(
                      <div key={i} style={{ fontSize:"0.74rem",color:"var(--aw-text)",lineHeight:1.55,marginBottom:6,paddingLeft:14,borderLeft:"2px solid rgba(34,197,94,0.4)" }}>
                        <strong style={{ color:"#86efac" }}>{r.tx.data} · R$ {r.tx.valor.toFixed(2)} · {r.tx.categoryId}</strong>: {r.reasons.join("; ")} (score {r.score})
                      </div>
                    ))}
                    {reviewReport.autoRejected.length > 5 && (
                      <div style={{ fontSize:"0.7rem",color:"#64748b",fontStyle:"italic",marginTop:6 }}>+ {reviewReport.autoRejected.length - 5} remoção(ões) adicional(is)</div>
                    )}
                  </div>
                )}

                {reviewReport.autoRecovered.length > 0 && (
                  <div style={{ marginTop:12,padding:"12px 14px",background:"rgba(34,197,94,0.04)",border:"1px solid rgba(34,197,94,0.18)",borderRadius:8 }}>
                    <div style={{ fontSize:"0.62rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#86efac",marginBottom:8 }}>✓ Descontos recuperados ({reviewReport.autoRecovered.length})</div>
                    {reviewReport.autoRecovered.slice(0,5).map((m,i)=>(
                      <div key={i} style={{ fontSize:"0.74rem",color:"var(--aw-text)",lineHeight:1.55,marginBottom:6,paddingLeft:14,borderLeft:"2px solid rgba(34,197,94,0.4)" }}>
                        <strong style={{ color:"#86efac" }}>{m.data} · R$ {m.valor.toFixed(2)}</strong>: recuperado da row "{(m.historico||"").slice(0,80)}"
                      </div>
                    ))}
                    {reviewReport.autoRecovered.length > 5 && (
                      <div style={{ fontSize:"0.7rem",color:"#64748b",fontStyle:"italic",marginTop:6 }}>+ {reviewReport.autoRecovered.length - 5} recuperação(ões) adicional(is)</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── BANNER LARANJA: residual que ainda precisa revisão manual ── */}
            {reviewReport && reviewReport.needsHumanReview && !reviewAcknowledged && (
              <div style={{ marginBottom:"2rem",padding:"1.5rem 1.75rem",background:"rgba(251,146,60,0.06)",border:"1px solid rgba(251,146,60,0.35)",borderRadius:12,boxShadow:"0 0 24px rgba(251,146,60,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",animation:"fadeSlide 0.35s ease" }}>
                <div style={{ display:"flex",alignItems:"flex-start",gap:14,marginBottom:14 }}>
                  <div style={{ flexShrink:0,width:36,height:36,borderRadius:10,background:"rgba(251,146,60,0.14)",border:"1px solid rgba(251,146,60,0.35)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:"0.6rem",fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"#fb923c",marginBottom:6 }}>Revisão Manual Recomendada</div>
                    <div style={{ fontSize:"0.95rem",fontWeight:700,color:"var(--aw-text)",marginBottom:4 }}>Itens com baixa confiança: não foram corrigidos automaticamente.</div>
                    <div style={{ fontSize:"0.78rem",color:"var(--aw-text-muted)",lineHeight:1.5 }}>O Finder detectou inconsistência mas não tem sinais suficientes pra decidir. Confira manualmente antes de gerar a peça.</div>
                  </div>
                </div>

                {reviewReport.suspicious.length > 0 && (
                  <div style={{ marginTop:14,padding:"12px 14px",background:"rgba(239,68,68,0.05)",border:"1px solid rgba(239,68,68,0.22)",borderRadius:8 }}>
                    <div style={{ fontSize:"0.62rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#f87171",marginBottom:8 }}>⚠ Possíveis falsos positivos ({reviewReport.suspicious.length})</div>
                    {reviewReport.suspicious.slice(0,5).map((s,i)=>(
                      <div key={i} style={{ fontSize:"0.74rem",color:"var(--aw-text)",lineHeight:1.55,marginBottom:6,paddingLeft:14,borderLeft:"2px solid rgba(239,68,68,0.4)" }}>
                        <strong style={{ color:"#fca5a5" }}>{s.tx.data} · R$ {s.tx.valor.toFixed(2)}</strong>: {s.detail}{s.score!=null?` (score ${s.score})`:""}
                      </div>
                    ))}
                    {reviewReport.suspicious.length > 5 && (
                      <div style={{ fontSize:"0.7rem",color:"#64748b",fontStyle:"italic",marginTop:6 }}>+ {reviewReport.suspicious.length - 5} suspeito(s) adicional(is). Verifique no extrato.</div>
                    )}
                  </div>
                )}

                <div style={{ marginTop:16,display:"flex",gap:10,justifyContent:"flex-end" }}>
                  <button onClick={()=>setReviewAcknowledged(true)} style={{ background:"rgba(251,146,60,0.12)",border:"1px solid rgba(251,146,60,0.4)",borderRadius:8,color:"#fb923c",fontFamily:"Inter,sans-serif",fontSize:"0.72rem",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",padding:"9px 18px",cursor:"pointer",transition:"all 0.18s" }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(251,146,60,0.2)";}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(251,146,60,0.12)";}}>Conferi manualmente · Continuar</button>
                </div>
              </div>
            )}

            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"1rem",marginBottom:"2rem" }}>
              {[
                { label:"Categorias de Irregularidade", val:groups.length, color:"hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)", sub:"tipologias distintas identificadas", featured:true, icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
                { label:"Ocorrências Detectadas", val:totalOcorrencias, color:"hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)", sub:"descontos irregulares", icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
                { label:"Valor Total a Restituir", val:fmt(totalValor), color:"hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)", sub:"sujeito à devolução com correção legal", icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
              ].map((k,i)=>(
                <div key={i} style={{ background:k.featured?"rgba(12,10,18,0.9)":"var(--aw-card-2)",backdropFilter:"blur(16px)",border:k.featured?"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.35)":"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"1.3rem 1.5rem",position:"relative",overflow:"hidden",animation:`fadeSlide 0.35s ease ${i*0.07}s both`,boxShadow:k.featured?"0 0 22px hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.18), inset 0 1px 0 rgba(255,255,255,0.06)":undefined }} className={k.featured?"kpi-featured":""}>
                  <div style={{ position:"absolute",top:0,left:0,right:0,height:1,background:k.featured?"linear-gradient(90deg,transparent,hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.8),transparent)":"linear-gradient(90deg,transparent,hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.35),transparent)" }}/>
                  {k.featured&&<div style={{ position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:"hsl(var(--accent-h), var(--accent-s), var(--accent-l))",opacity:0.14,filter:"blur(28px)",pointerEvents:"none" }}/>}
                  <div style={{ position:"relative",zIndex:1 }}>
                    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
                      <div style={{ fontSize:"0.6rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:k.featured?"rgba(96,165,250,0.7)":"var(--aw-text-dim)" }}>{k.label}</div>
                      <div style={{ opacity:k.featured?1:0.7 }}>{k.icon}</div>
                    </div>
                    <div style={{ fontSize:"1.85rem",fontWeight:800,color:k.color,letterSpacing:"-1px",lineHeight:1 }}>{k.val}</div>
                    <div style={{ fontSize:"0.7rem",color:k.featured?"rgba(96,165,250,0.45)":"var(--aw-text-dim)",marginTop:6 }}>{k.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {groups.length===0 && (
              <div style={{ textAlign:"center",padding:"3rem 2rem",background:"var(--aw-card)",borderRadius:12,border:"1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize:"2rem",marginBottom:"1rem" }}>✅</div>
                <p style={{ fontWeight:700,color:"var(--aw-text)",marginBottom:6 }}>Nenhum desconto irregular identificado</p>
                <p style={{ fontSize:"0.82rem",color:"var(--aw-text-dim)" }}>Não foram encontradas rubricas suspeitas no documento analisado.</p>
              </div>
            )}

            {groups.length>0 && (
              <>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:"1rem" }}>
                  <span style={{ fontSize:"0.62rem",fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"var(--aw-text-dim)" }}>Drill-down por Categoria</span>
                  <div style={{ flex:1,height:1,background:"rgba(255,255,255,0.05)" }}/>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <button onClick={selectedCats.size===groups.length?clearSelection:selectAllCats} style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,color:"#64748b",fontFamily:"Inter,sans-serif",fontSize:"0.62rem",fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",padding:"5px 12px",cursor:"pointer",transition:"all 0.15s" }} onMouseEnter={e=>{e.currentTarget.style.color="var(--aw-text-muted)";e.currentTarget.style.borderColor="rgba(255,255,255,0.2)";}} onMouseLeave={e=>{e.currentTarget.style.color="#64748b";e.currentTarget.style.borderColor="rgba(255,255,255,0.1)";}}>
                      {selectedCats.size===groups.length?"Limpar Seleção":"Selecionar Todos"}
                    </button>
                    {selectedCats.size>0 && (
                      <VincularBotao compact onVinculado={aoVincular}
                        bancoMeta={{ banco: meta.banco, agencia: meta.agencia, conta: meta.conta }}
                        batchLabels={groups.filter(g => selectedCats.has(g.cat.id)).map(g => g.cat.label)}
                        produceCombinedBlob={async () => {
                          const XLSX = await loadXLSX();
                          const sel = groups.filter(g => selectedCats.has(g.cat.id));
                          if (sel.length === 0) return null;
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, buildMultiSheet(XLSX, sel), "Descontos Identificados");
                          const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
                          const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                          const totalValor = sel.reduce((s2, g) => s2 + g.items.reduce((s3, it) => s3 + Math.abs(it.valor || 0), 0), 0);
                          const qtdItens = sel.reduce((s2, g) => s2 + g.items.length, 0);
                          const { dataInicio, dataFim } = periodoDosItens(sel.flatMap(g => g.items));
                          return { blob, fileName: `Analise-${sel.length}cats.xlsx`, totalValor, qtdItens, dataInicio, dataFim };
                        }} />
                    )}
                    {selectedCats.size>0 && (
                      <button onClick={batchExport} disabled={batchExporting} style={{ display:"flex",alignItems:"center",gap:6,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.35)",borderRadius:6,color:"#4ade80",fontFamily:"Inter,sans-serif",fontSize:"0.62rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",padding:"5px 14px",cursor:batchExporting?"wait":"pointer",transition:"all 0.15s" }} onMouseEnter={e=>{if(!batchExporting){e.currentTarget.style.background="rgba(34,197,94,0.18)";e.currentTarget.style.boxShadow="0 0 16px rgba(34,197,94,0.2)";}}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(34,197,94,0.1)";e.currentTarget.style.boxShadow="none";}}>
                        {batchExporting?<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation:"spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
                        {batchExporting?"Gerando…":`Extrair ${selectedCats.size} Relatório${selectedCats.size>1?"s":""}`}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:"0.75rem" }}>
                  {groups.map((group,idx)=>(
                    <CategoryCard key={group.cat.id} vinculado={(vinculados.get(group.cat.label)||0)>0} vinculadoCount={vinculados.get(group.cat.label)||0} cat={group.cat} items={group.items} delay={idx*0.07} downloaded={downloadedCats.has(group.cat.id)} selected={selectedCats.has(group.cat.id)} onToggleSelect={toggleSelectCat} onClick={()=>setActiveModal(group)}
                      anulada={anuladas[group.cat.id]?.motivo || null}
                      onToggleAnulada={()=> anuladas[group.cat.id] ? setCancelAnulacaoCat(group.cat) : setMotivoAnulacaoCat(group.cat)} />
                  ))}
                </div>
                {Object.keys(anuladas).length > 0 && (
                  <div style={{ marginTop:"1rem",padding:"0.9rem 1.2rem",background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:10,display:"flex",alignItems:"flex-start",gap:10,fontSize:"0.77rem",color:"#fcd34d" }}>
                    <span style={{ fontSize:14,flexShrink:0,marginTop:1 }}>🔒</span>
                    <div><strong>{Object.keys(anuladas).length} rubrica{Object.keys(anuladas).length>1?"s":""} marcada{Object.keys(anuladas).length>1?"s":""} como não ajuizável{Object.keys(anuladas).length>1?"is":""}.</strong> Ficam fora dos totais, da planilha e das filas do pré-protocolo. Clique no cadeado da rubrica pra cancelar a inviabilidade.</div>
                  </div>
                )}
                {groups.some(g => g.cat.naoReembolsavel) && (
                  <div style={{ marginTop:"1rem",padding:"0.9rem 1.2rem",background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:10,display:"flex",alignItems:"flex-start",gap:10,fontSize:"0.77rem",color:"#fcd34d" }}>
                    <span style={{ fontSize:14,flexShrink:0,marginTop:1 }}>⚠</span>
                    <div><strong>Invest Fácil: prática abusiva identificada.</strong> Os valores destacados em amarelo NÃO são para reembolso direto (o dinheiro retorna ao cliente). A irregularidade está na prática em si: o banco aplica os recursos do cliente sem rendimento real, em benefício próprio. Documentar como fundamento adicional na ação.</div>
                  </div>
                )}
                <div style={{ marginTop:"1rem",padding:"0.9rem 1.2rem",background:"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.04)",border:"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.1)",borderRadius:10,display:"flex",alignItems:"center",gap:10,fontSize:"0.77rem",color:"var(--aw-text-dim)" }}>
                  <span style={{ fontSize:14,flexShrink:0 }}>💡</span>
                  Clique em qualquer card para ver os lançamentos detalhados, com data, rubrica, valor e fundamentação jurídica.
                </div>
                <div style={{ marginTop:"1.8rem",display:"flex",justifyContent:"center" }}>
                  <button onClick={()=>setShowDashboard(v=>!v)} style={{ display:"flex",alignItems:"center",gap:10,background:showDashboard?"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.14)":"rgba(255,255,255,0.03)",border:showDashboard?"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.4)":"1px solid rgba(255,255,255,0.08)",borderRadius:12,color:showDashboard?"hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)":"var(--aw-text-dim)",fontFamily:"Inter,sans-serif",fontSize:"0.78rem",fontWeight:600,letterSpacing:"0.5px",padding:"11px 24px",cursor:"pointer",transition:"all 0.22s ease",boxShadow:showDashboard?"0 0 24px hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.2)":"none" }} onMouseEnter={e=>{e.currentTarget.style.borderColor="hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.45)";e.currentTarget.style.color="hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)";e.currentTarget.style.background="hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.1)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=showDashboard?"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.4)":"rgba(255,255,255,0.08)";e.currentTarget.style.color=showDashboard?"hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)":"var(--aw-text-dim)";e.currentTarget.style.background=showDashboard?"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.14)":"rgba(255,255,255,0.03)";}}>
                    {showDashboard?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                    {showDashboard?"Ocultar Relatório":"Ver Relatório para o Cliente"}
                  </button>
                </div>
                {showDashboard && <DashboardErrorBoundary><AnalyticsDashboard groups={groups.filter(g => !anuladas[g.cat.id])} meta={meta} totalValor={totalValor} totalOcorrencias={totalOcorrencias} /></DashboardErrorBoundary>}
              </>
            )}
          </div>
        )}
      </div>

      {activeModal && (() => {
        // Re-derivar group ao vivo: items podem ter sido excluídos/adicionados depois do click inicial
        const liveGroup = finalGrouped[activeModal.cat.id] || activeModal;
        return <Modal group={liveGroup} onVinculado={aoVincular} bancoMeta={{ banco: meta.banco, agencia: meta.agencia, conta: meta.conta }} onClose={()=>setActiveModal(null)} clientName={meta.clientName} onExported={(catId)=>setDownloadedCats(prev=>new Set([...prev,catId]))} buildSheet={buildSheet} loadXLSX={loadXLSX} onExclude={handleExcludeItem} onAdd={handleAddItem} onMove={(catId, item)=>setMovingItem({ fromCatId: catId, item })} />;
      })()}

      {/* ── MODAL DE MOVIMENTAÇÃO ENTRE CATEGORIAS ── */}
      {movingItem && (
        <div onClick={()=>setMovingItem(null)} style={{ position:"fixed",inset:0,zIndex:1100,background:"var(--aw-card)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"1.5rem",animation:"mFadeIn 0.18s ease" }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%",maxWidth:560,maxHeight:"80%",background:"rgba(12,10,18,0.97)",border:"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.4)",borderRadius:14,overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 0 60px hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.25), 0 30px 60px rgba(0,0,0,0.7)" }}>
            <div style={{ padding:"1.2rem 1.5rem",borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize:"0.6rem",fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"hsl(var(--accent-h), var(--sat-destaque, 95%), 76%)",marginBottom:6 }}>Mover lançamento</div>
              <div style={{ fontSize:"1rem",fontWeight:700,color:"var(--aw-text)",marginBottom:4 }}>Para qual categoria?</div>
              <div style={{ fontSize:"0.78rem",color:"#64748b" }}>{movingItem.item.data} · R$ {(movingItem.item.valor || 0).toFixed(2).replace(".",",")} · {(movingItem.item.historico || "").slice(0,80)}{(movingItem.item.historico||"").length>80?"...":""}</div>
            </div>
            <div style={{ overflow:"auto",padding:"1rem 1.2rem",display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"0.55rem" }}>
              {CATEGORIAS.filter(c=>c.id!==movingItem.fromCatId).map(c=>(
                <button key={c.id} onClick={()=>handleMoveItem(movingItem.fromCatId, movingItem.item, c.id)} style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:9,color:"var(--aw-text)",padding:"11px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.15s",fontFamily:"Inter,sans-serif" }} onMouseEnter={e=>{e.currentTarget.style.borderColor="hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.5)";e.currentTarget.style.background="hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.08)";e.currentTarget.style.color="var(--aw-text)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.08)";e.currentTarget.style.background="rgba(255,255,255,0.03)";e.currentTarget.style.color="var(--aw-text)";}}>
                  <div style={{ fontSize:"0.83rem",fontWeight:700,marginBottom:3 }}>{c.label}</div>
                  <div style={{ fontSize:"0.68rem",color:"var(--aw-text-dim)",lineHeight:1.4 }}>{c.sublabel || c.descricao}</div>
                </button>
              ))}
            </div>
            <div style={{ padding:"0.9rem 1.5rem",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"flex-end" }}>
              <button onClick={()=>setMovingItem(null)} style={{ background:"transparent",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"var(--aw-text-muted)",fontFamily:"Inter,sans-serif",fontSize:"0.72rem",fontWeight:600,letterSpacing:"1.2px",textTransform:"uppercase",padding:"8px 16px",cursor:"pointer" }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      </div>
      )}
      </div>
    </PonteFinder.Provider>
  );
}
