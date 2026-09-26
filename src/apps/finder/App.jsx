import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { CATEGORIAS, THEME, matchCategoria, analyzeAll, parseDocumentoPDF } from "./parser.js";
import { reviewMatches, recoverMissingTransactions, autoCorrectTransactions, refineWithLLM } from "./reviewer.js";
import { PonteFinder, VincularBotao, useVincular, periodoDosItens, nomeDeAba } from "./vincular.jsx";
import { SaguaoFinder } from "./Saguao.tsx";
import { ResultadosFinder } from "./Resultados.tsx";

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
    /* Com uma janela do AW aberta por cima (escolher o cliente), o Esc é
       dela: fechar as duas de uma vez perderia a rubrica que estava aberta. */
    const fn = e => { if (e.key === "Escape" && !document.querySelector('[role="dialog"][data-state="open"]')) onClose(); };
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
   RUBRICAS NÃO AJUIZÁVEIS (feature recuperada do ME, 11/06/2026)
   A atendente/advogado marca uma rubrica que NÃO entra na ação (cliente já
   entrou com essa ação por outro advogado, ou não quer ajuizar). A rubrica
   fica amarela + riscada + cadeado e SAI dos totais, da planilha e do evento
   analysis-ready (o pré-protocolo não a leva pras filas/peça). A linha da
   rubrica e as janelas do cadeado moram em Resultados.tsx.
───────────────────────────────────────────── */
const MOTIVOS_ANULACAO = [
  { id: "ja_ajuizada", label: "Já ajuizada por outro advogado", sub: "Cliente já entrou com essa ação, então a rubrica não pode ser ajuizada de novo." },
  { id: "cliente_nao_quer", label: "Cliente não quer ajuizar", sub: "O cliente recusou a inclusão desta rubrica na ação." },
  /* Veio da análise comercial do ME, que já tinha este terceiro motivo: sem
     ele, uma rubrica bloqueada lá chegaria aqui com o código cru no cartão. */
  { id: "rubrica_invalida", label: "Rubrica inválida", sub: "Não é cobrança indevida de verdade: fica fora da ação." },
];

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
 *  acaoComercial     o botão de gerar a análise comercial, que a página põe
 *                    na barra de decisão do relatório (Finder solto)
 */
export default function App({
  contexto = null,
  ponte = null,
  arquivosIniciais = null,
  anuladasIniciais = null,
  onLiberarAnulada = null,
  onAnalisePronta = null,
  onReset = null,
  acaoComercial = null,
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
  /* "Pular auditor de IA": derruba o lote em andamento e o relatório sai só
     da análise por código (ver refineWithLLM). */
  const iaRef = useRef(null);
  const pularIa = useCallback(() => {
    if (!iaRef.current) return;
    mexerNoProgresso(p => ({ ...p, iaPulada: true }));
    iaRef.current.abort();
  }, [mexerNoProgresso]);
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
      const ctrl = new AbortController();
      iaRef.current = ctrl;
      try {
        auto = await refineWithLLM(auto, FINDER_LLM_URL, {
          onProgress: (feitos, total) => mexerNoProgresso(p => ({ ...p, auditor: { feitos, total } })),
          signal: ctrl.signal,
        });
      } catch (e) { console.warn("AWFINDER REVISOR falhou:", e); }
      finally { iaRef.current = null; }
      if (ctrl.signal.aborted) {
        auto = { ...auto, summary: (auto.summary || "") + " · auditor de IA pulado, análise só por código" };
      }
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
    /* O DESFECHO fica na tela o bastante para ser lido: com pontos a conferir,
       um pouco mais, porque ali tem uma frase que importa. */
    const aConferir = auto.needsHumanReview ? ((auto.residualSuspicious?.length || 0) + (auto.residualMissing?.length || 0)) : 0;
    if (Object.keys(g).length>0) { setPhase("success"); setTimeout(()=>setPhase("results"), aConferir > 0 ? 3600 : 2600); }
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

  /* "Selecionar todos" saiu (ver Resultados.tsx): marcar tudo sem olhar é o
     que a lista existe para evitar. */

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

  /* VINCULAR EM LOTE, o da barra de decisão: UMA análise com as rubricas
     marcadas vai para o cliente (a mesma planilha combinada de antes). */
  const marcadasParaVincular = useMemo(() => groups.filter(g => selectedCats.has(g.cat.id)), [groups, selectedCats]);
  const vinculoEmLote = useVincular({
    ponte: ponteComCliente,
    onVinculado: aoVincular,
    bancoMeta: { banco: meta.banco, agencia: meta.agencia, conta: meta.conta },
    batchLabels: marcadasParaVincular.map(g => g.cat.label),
    produceCombinedBlob: async () => {
      const XLSX = await loadXLSX();
      const sel = marcadasParaVincular;
      if (sel.length === 0) return null;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, buildMultiSheet(XLSX, sel), "Descontos Identificados");
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const totalValor = sel.reduce((s2, g) => s2 + g.items.reduce((s3, it) => s3 + Math.abs(it.valor || 0), 0), 0);
      const qtdItens = sel.reduce((s2, g) => s2 + g.items.length, 0);
      const { dataInicio, dataFim } = periodoDosItens(sel.flatMap(g => g.items));
      return { blob, fileName: `Analise-${sel.length}cats.xlsx`, totalValor, qtdItens, dataInicio, dataFim };
    },
  });

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
        .aw-finder-camada>*{pointer-events:auto}
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
          onPularIa={pularIa}
          resumo={(() => {
            const gs = Object.values(grouped);
            const conferir = reviewReport?.needsHumanReview ? ((reviewReport.suspicious?.length || 0) + (reviewReport.missing?.length || 0)) : 0;
            return {
              rubricas: gs.filter(g2 => !g2.cat.naoReembolsavel).length,
              total: gs.filter(g2 => !g2.cat.naoReembolsavel).reduce((t, g2) => t + g2.items.reduce((u, it) => u + (Number(it.valor) || 0), 0), 0),
              conferir,
            };
          })()}
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
      <>
        <ResultadosFinder
          meta={meta}
          arquivo={fileName}
          clienteNome={clienteNome}
          grupos={groups}
          anuladas={anuladas}
          motivos={MOTIVOS_ANULACAO}
          vinculados={vinculados}
          baixadas={downloadedCats}
          selecionadas={selectedCats}
          onAlternar={toggleSelectCat}
          onAbrir={(g)=>setActiveModal(g)}
          onCadeado={(g)=> anuladas[g.cat.id] ? setCancelAnulacaoCat(g.cat) : setMotivoAnulacaoCat(g.cat)}
          totalValor={totalValor}
          totalOcorrencias={totalOcorrencias}
          revisao={reviewReport}
          revisaoConferida={reviewAcknowledged}
          onConferir={()=>setReviewAcknowledged(true)}
          titularesMisturados={mixedTitulares}
          vinculo={vinculoEmLote}
          onExtrair={batchExport}
          extraindo={batchExporting}
          acaoComercial={acaoComercial}
          confirmandoNova={confirmReset}
          onPedirNova={()=>setConfirmReset(true)}
          onCancelarNova={()=>setConfirmReset(false)}
          onConfirmarNova={reset}
          pedindoMotivo={motivoAnulacaoCat}
          onMotivo={anularRubrica}
          onFecharMotivo={()=>setMotivoAnulacaoCat(null)}
          liberando={cancelAnulacaoCat}
          onLiberar={cancelarAnulacao}
          onFecharLiberar={()=>setCancelAnulacaoCat(null)}
          relatorioAberto={showDashboard}
          onAlternarRelatorio={()=>setShowDashboard(v=>!v)}
          relatorio={
            /* O relatório para o cliente segue na tela antiga, com a inversão
               dos temas claros que o acompanha. */
            <div className="aw-finder-legado">
              <DashboardErrorBoundary><AnalyticsDashboard groups={groups.filter(g => !anuladas[g.cat.id])} meta={meta} totalValor={totalValor} totalOcorrencias={totalOcorrencias} /></DashboardErrorBoundary>
            </div>
          }
        />

        {/* A CAMADA DAS JANELAS ANTIGAS (lançamentos da rubrica e mover
            lançamento). Cobre a área do Finder sem pegar clique; só as janelas
            abertas pegam. É .aw-finder-legado para herdar o estilo e a
            inversão dos temas claros que essas janelas ainda usam. */}
        <div className="aw-finder-legado aw-finder-camada" style={{ position:"absolute",inset:0,pointerEvents:"none",zIndex:40 }}>
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
      </>
      )}
      </div>
    </PonteFinder.Provider>
  );
}
