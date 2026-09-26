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
import { toast } from "sonner";
import { Search, UserRound, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ─────────────────────────────────────────────
   A PONTE com o AW (injetada pela página)
───────────────────────────────────────────── */
export const PonteFinder = createContext(null);
export const usePonte = () => useContext(PonteFinder);

/* ─────────────────────────────────────────────
   AVISO: o toast do AW
   Era um aviso desenhado à mão, preso na caixa do Finder e pintado de escuro
   (invertido nos temas claros). Agora é o mesmo toast do resto do sistema,
   vindo de CIMA: embaixo mora a barra de decisão do relatório, e o aviso de
   "vinculado" cobriria justo o botão que acabou de ser apertado.
───────────────────────────────────────────── */
export function avisar(texto, tipo = "success") {
  const onde = { position: "top-center" };
  if (tipo === "error") toast.error(String(texto), onde);
  else toast.success(String(texto), onde);
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
   VINCULAR, a lógica sem o botão
   - uma categoria: `produceBlob` + `desconto`
   - várias (lote): `produceCombinedBlob` + `batchLabels`
   Com cliente no contexto, vincula direto; sem, pergunta qual.
   Devolve `clicar`, `ocupado` e a `janela` de escolher o cliente, que quem usa
   põe na tela. Assim o botão da janela da rubrica e o da barra de decisão
   do relatório são a mesma coisa, cada um com a sua cara.
───────────────────────────────────────────── */
export function useVincular({ produceBlob, desconto, produceCombinedBlob, batchLabels, bancoMeta, onVinculado, ponte: ponteDada }) {
  /* `ponte` explícita para quem usa o hook ACIMA do PonteFinder.Provider (o
     próprio App, que é quem monta o provider): lá o contexto ainda é nulo. */
  const ponteDoContexto = usePonte();
  const ponte = ponteDada || ponteDoContexto;
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

  const janela = (
    <EscolherCliente aberto={escolhendo} ponte={ponte}
      onClose={() => { setEscolhendo(false); setDepoisDeEscolher(null); }} onSelect={escolheu} />
  );
  const dica = emLote
    ? `Cria UMA analise combinada com ${batchLabels.length} categoria${batchLabels.length>1?"s":""}: ${batchLabels.join(", ")}`
    : cliente?.id ? "Vincular ao cliente atual" : "Escolher cliente";
  return { clicar, ocupado, janela, dica, emLote };
}

/* O BOTÃO "Vincular Análise" da janela da rubrica (tela antiga). */
export function VincularBotao({ compact, ...opcoes }) {
  const { clicar, ocupado, janela, dica, emLote } = useVincular(opcoes);
  const { batchLabels } = opcoes;
  const rotulo = ocupado ? "Vinculando…" : emLote ? `Vincular ${batchLabels.length} Análise${batchLabels.length > 1 ? "s" : ""}` : "Vincular Análise";
  const tam = compact ? "11" : "13";

  return (
    <>
      <button onClick={clicar} disabled={ocupado}
        style={{ display:"inline-flex",alignItems:"center",gap:7,background:VERDE_BG,border:`1px solid ${VERDE_BORDA}`,borderRadius:compact?6:8,color:VERDE_TEXTO,fontFamily:"Inter,sans-serif",fontSize:compact?"0.62rem":"0.7rem",fontWeight:700,letterSpacing:compact?"1px":"1.5px",textTransform:"uppercase",padding:compact?"5px 12px":"8px 14px",cursor:ocupado?"wait":"pointer",transition:"all 0.18s",whiteSpace:"nowrap",flexShrink:0 }}
        onMouseEnter={e=>{ if(!ocupado){ e.currentTarget.style.background=VERDE_HOVER; e.currentTarget.style.boxShadow="0 0 16px rgba(16,185,129,0.25)"; } }}
        onMouseLeave={e=>{ e.currentTarget.style.background=VERDE_BG; e.currentTarget.style.boxShadow="none"; }}
        title={dica}>
        {ocupado
          ? <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation:"spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          : <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>}
        {rotulo}
      </button>
      {janela}
    </>
  );
}

/* ─────────────────────────────────────────────
   "Vincular a qual cliente?"
   Janela do AW (a mesma dos outros diálogos), e não mais a desenhada à mão:
   ela sai por cima de tudo, inclusive da janela da rubrica, e segue o tema.
───────────────────────────────────────────── */
function EscolherCliente({ aberto, onClose, onSelect, ponte }) {
  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!aberto) return;
    setBusca(""); setCarregando(true);
    ponte.listarClientes()
      .then((l) => setClientes(l || []))
      .catch((e) => { console.error(e); avisar("Erro ao carregar clientes: " + (e?.message || e), "error"); onClose(); })
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const filtrados = clientes.filter((c) => {
    const q = busca.trim().toLowerCase();
    return q ? (c.nome?.toLowerCase().includes(q) || c.cpf_cnpj?.toLowerCase().includes(q)) : true;
  });

  return (
    <Dialog open={!!aberto} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular a qual cliente?</DialogTitle>
          <DialogDescription>Escolha o cliente que receberá esta análise no perfil dele.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF…" className="pl-9" />
        </div>
        <div className="max-h-[50vh] min-h-[7.5rem] overflow-y-auto -mx-1 px-1 space-y-0.5">
          {carregando && (
            <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando clientes…
            </p>
          )}
          {!carregando && filtrados.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {busca.trim() ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado."}
            </p>
          )}
          {!carregando && filtrados.map((c) => (
            <button key={c.id} type="button" onClick={() => onSelect(c)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/25">
                <UserRound className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.nome}</span>
                {c.cpf_cnpj && <span className="block text-xs text-muted-foreground">{c.cpf_cnpj}</span>}
              </span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
