/* VINCULAR ANÁLISE: a planilha de uma categoria (ou de várias) vira uma
 * demanda "análise vinculada" na esteira do cliente.
 *
 * Esta é a camada do ME que só existia no pacote compactado: ela foi feita
 * como patch local antes de um build, em 22/05, e o código nunca entrou em
 * repositório nenhum. Reconstruída em 25/09 a partir do pacote, com o mesmo
 * comportamento e os mesmos textos (ver docs/finder-contrato.md, seção 4.3).
 *
 * A DIFERENÇA é por onde ela fala com o banco. O pacote levava a chave
 * pública escrita dentro dele; aqui quem fala é a ponte do AW (`ponte`), com o
 * login de quem está usando. Este arquivo não sabe nada de Supabase.
 */
import React, { createContext, useContext, useEffect, useState } from "react";

/* ─────────────────────────────────────────────
   A PONTE com o AW (injetada pela página)
───────────────────────────────────────────── */
export const PonteFinder = createContext(null);
export const usePonte = () => useContext(PonteFinder);

/* ─────────────────────────────────────────────
   AVISO no canto da tela (o toast do Finder)
───────────────────────────────────────────── */
export function avisar(texto, tipo = "success") {
  const temas = {
    success: { bg: "hsla(160,84%,40%,0.15)", border: "hsla(160,84%,40%,0.45)", text: "#34d399", icon: "✓" },
    error: { bg: "hsla(0,72%,55%,0.15)", border: "hsla(0,72%,55%,0.45)", text: "#f87171", icon: "✕" },
  };
  const t = temas[tipo] || temas.success;
  const el = document.createElement("div");
  el.setAttribute("data-aw-toast", "1");
  el.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 100000;
    display: flex; align-items: center; gap: 10px;
    padding: 14px 18px; background: ${t.bg};
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border: 1px solid ${t.border}; border-radius: 12px;
    color: ${t.text}; font-family: Inter, sans-serif;
    font-size: 13px; font-weight: 500;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: awToastIn 0.25s ease-out; max-width: 420px;
  `;
  el.innerHTML = `
    <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${t.border};color:#fff;font-weight:700;flex-shrink:0;">${t.icon}</span>
    <span style="color:hsl(0 0% 95%);">${String(texto).replace(/</g, "&lt;")}</span>
  `;
  if (!document.getElementById("aw-toast-style")) {
    const st = document.createElement("style");
    st.id = "aw-toast-style";
    st.textContent = `
      @keyframes awToastIn { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
      @keyframes awToastOut { from{opacity:1;transform:translateY(0);} to{opacity:0;transform:translateY(20px);} }
    `;
    document.head.appendChild(st);
  }
  /* Dentro da caixa do Finder, e não no corpo da página: assim o aviso segue o
     tema dele (inclusive a inversão dos temas claros) e aparece no canto do
     Finder, como aparecia quando ele era um iframe. */
  (document.querySelector(".aw-finder-legado") || document.querySelector(".aw-finder") || document.body).appendChild(el);
  setTimeout(() => {
    el.style.animation = "awToastOut 0.25s ease-in forwards";
    setTimeout(() => el.remove(), 260);
  }, 3500);
}

/* ─────────────────────────────────────────────
   O PERÍODO dos lançamentos, no formato da esteira
   (dd/mm/aaaa, o primeiro e o último)
───────────────────────────────────────────── */
export function periodoDosItens(itens) {
  let ini = null, fim = null;
  for (const it of itens || []) {
    const p = (it.data || "").split("/");
    if (p.length !== 3) continue;
    const [d, m, a] = p;
    if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(a)) continue;
    const iso = `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!ini || iso < ini.iso) ini = { iso, br: it.data };
    if (!fim || iso > fim.iso) fim = { iso, br: it.data };
  }
  return { dataInicio: ini?.br || null, dataFim: fim?.br || null };
}

/* O nome de aba que o Excel aceita. */
export const nomeDeAba = (s) => String(s || "").replace(/[:\\/?*[\]]/g, "-").trim().slice(0, 31) || "Planilha";

const VERDE_BG = "rgba(16,185,129,0.12)";
const VERDE_BORDA = "rgba(16,185,129,0.45)";
const VERDE_TEXTO = "#34d399";
const VERDE_HOVER = "rgba(16,185,129,0.22)";

/* ─────────────────────────────────────────────
   O BOTÃO "Vincular Análise"
   - uma categoria: `produceBlob` + `desconto`
   - várias (lote): `produceCombinedBlob` + `batchLabels`
   Com cliente no contexto, vincula direto; sem, pergunta qual.
───────────────────────────────────────────── */
export function VincularBotao({ produceBlob, desconto, produceCombinedBlob, batchLabels, bancoMeta, onVinculado, compact }) {
  const ponte = usePonte();
  const meta = bancoMeta || {};
  const [ocupado, setOcupado] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [depoisDeEscolher, setDepoisDeEscolher] = useState(null);
  const emLote = Array.isArray(batchLabels) && typeof produceCombinedBlob === "function";
  const cliente = ponte?.cliente || null;

  const vincular = async (clienteId, clienteNome) => {
    try {
      if (emLote) {
        if (batchLabels.length === 0) { avisar("Selecione ao menos uma categoria.", "error"); return; }
        const r = await produceCombinedBlob();
        if (!r || !r.blob) { avisar("Falha ao gerar a planilha combinada.", "error"); return; }
        await ponte.criarVinculada({
          clienteId, desconto: batchLabels.join(" + "),
          planilhaUrl: await ponte.subirPlanilha(r.blob, r.fileName),
          totalValor: r.totalValor, qtdItens: r.qtdItens,
          banco: meta.banco, agencia: meta.agencia, conta: meta.conta,
          dataInicio: r.dataInicio, dataFim: r.dataFim,
        });
        if (typeof onVinculado === "function") onVinculado(batchLabels);
        avisar(`Análise (${batchLabels.length} categorias) vinculada a ${clienteNome}`, "success");
      } else {
        const r = await produceBlob();
        if (!r || !r.blob) { avisar("Falha ao gerar a planilha pra vinculacao.", "error"); return; }
        await ponte.criarVinculada({
          clienteId, desconto,
          planilhaUrl: await ponte.subirPlanilha(r.blob, r.fileName),
          totalValor: r.totalValor, qtdItens: r.qtdItens,
          banco: meta.banco, agencia: meta.agencia, conta: meta.conta,
          dataInicio: r.dataInicio, dataFim: r.dataFim,
        });
        if (typeof onVinculado === "function") onVinculado([desconto]);
        avisar(`Análise vinculada a ${clienteNome}`, "success");
      }
    } catch (e) {
      console.error("[vincular]", e);
      avisar("Erro ao vincular: " + (e?.message || e), "error");
    }
  };

  const clicar = async () => {
    if (ocupado || !ponte) return;
    setOcupado(true);
    try {
      if (cliente?.id) await vincular(cliente.id, cliente.nome || "Cliente");
      else { setDepoisDeEscolher(() => (c) => vincular(c.id, c.nome)); setEscolhendo(true); }
    } finally {
      setOcupado(false);
    }
  };

  const escolheu = async (c) => {
    setEscolhendo(false);
    if (!depoisDeEscolher) return;
    setOcupado(true);
    try { await depoisDeEscolher(c); } finally { setOcupado(false); setDepoisDeEscolher(null); }
  };

  const rotulo = ocupado ? "Vinculando…" : emLote ? `Vincular ${batchLabels.length} Análise${batchLabels.length > 1 ? "s" : ""}` : "Vincular Análise";
  const tam = compact ? "11" : "13";

  return (
    <>
      <button onClick={clicar} disabled={ocupado}
        style={{ display:"inline-flex",alignItems:"center",gap:7,background:VERDE_BG,border:`1px solid ${VERDE_BORDA}`,borderRadius:compact?6:8,color:VERDE_TEXTO,fontFamily:"Inter,sans-serif",fontSize:compact?"0.62rem":"0.7rem",fontWeight:700,letterSpacing:compact?"1px":"1.5px",textTransform:"uppercase",padding:compact?"5px 12px":"8px 14px",cursor:ocupado?"wait":"pointer",transition:"all 0.18s",whiteSpace:"nowrap",flexShrink:0 }}
        onMouseEnter={e=>{ if(!ocupado){ e.currentTarget.style.background=VERDE_HOVER; e.currentTarget.style.boxShadow="0 0 16px rgba(16,185,129,0.25)"; } }}
        onMouseLeave={e=>{ e.currentTarget.style.background=VERDE_BG; e.currentTarget.style.boxShadow="none"; }}
        title={emLote ? `Cria UMA analise combinada com ${batchLabels.length} categoria${batchLabels.length>1?"s":""}: ${batchLabels.join(", ")}` : cliente?.id ? "Vincular ao cliente atual" : "Escolher cliente"}>
        {ocupado
          ? <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation:"spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          : <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>}
        {rotulo}
      </button>
      {escolhendo && (
        <EscolherCliente onClose={() => { setEscolhendo(false); setDepoisDeEscolher(null); }} onSelect={escolheu} />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
   "Vincular a qual cliente?"
───────────────────────────────────────────── */
function EscolherCliente({ onClose, onSelect }) {
  const ponte = usePonte();
  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    ponte.listarClientes()
      .then((l) => setClientes(l || []))
      .catch((e) => { console.error(e); avisar("Erro ao carregar clientes: " + (e?.message || e), "error"); onClose(); })
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = clientes.filter((c) => {
    const q = busca.trim().toLowerCase();
    return q ? (c.nome?.toLowerCase().includes(q) || c.cpf_cnpj?.toLowerCase().includes(q)) : true;
  });

  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",animation:"mFadeIn 0.15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width:"min(520px, 100%)",maxHeight:"80%",background:"hsl(0 0% 6%)",border:"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.20)",borderRadius:16,padding:"1.5rem",display:"flex",flexDirection:"column",gap:"1rem",fontFamily:"Inter,sans-serif" }}>
        <div>
          <h3 style={{ fontSize:16,fontWeight:600,color:"hsl(0 0% 98%)",margin:0 }}>Vincular a qual cliente?</h3>
          <p style={{ fontSize:12,color:"hsl(0 0% 60%)",marginTop:4 }}>Escolha o cliente que receberá esta análise no perfil dele.</p>
        </div>
        <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF…"
          style={{ background:"hsl(0 0% 10%)",border:"1px solid hsl(0 0% 18%)",borderRadius:10,padding:"10px 14px",color:"hsl(0 0% 98%)",fontSize:13,outline:"none",fontFamily:"Inter,sans-serif" }} />
        <div style={{ flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:4,minHeight:120 }}>
          {carregando && <div style={{ fontSize:12,color:"hsl(0 0% 55%)",padding:"1rem",textAlign:"center" }}>Carregando clientes…</div>}
          {!carregando && filtrados.length === 0 && (
            <p style={{ color:"hsl(0 0% 50%)",fontSize:12,textAlign:"center",padding:"2rem 0" }}>
              {busca.trim() ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado."}
            </p>
          )}
          {filtrados.map((c) => (
            <button key={c.id} onClick={() => onSelect(c)}
              style={{ display:"flex",alignItems:"center",gap:12,background:"transparent",border:"1px solid transparent",borderRadius:10,padding:"10px 12px",color:"hsl(0 0% 98%)",fontFamily:"Inter,sans-serif",fontSize:13,cursor:"pointer",textAlign:"left",transition:"all 0.15s",fontWeight:500 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.10)"; e.currentTarget.style.borderColor = "hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.30)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
              <div style={{ width:32,height:32,borderRadius:"50%",background:"hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.15)",border:"1px solid hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.30)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--accent-h) 60% 70%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontWeight:500,fontSize:13 }}>{c.nome}</div>
                {c.cpf_cnpj && <div style={{ fontSize:11,color:"hsl(0 0% 55%)" }}>{c.cpf_cnpj}</div>}
              </div>
            </button>
          ))}
        </div>
        <div style={{ display:"flex",justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ background:"transparent",border:"1px solid hsl(0 0% 18%)",borderRadius:8,padding:"8px 16px",color:"hsl(0 0% 75%)",fontFamily:"Inter,sans-serif",fontSize:12,fontWeight:500,cursor:"pointer" }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
