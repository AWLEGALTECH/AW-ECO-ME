// AW SHEETS — extrai rubricas de contracheques e gera tabela (meses × rubricas).
// Tudo no navegador: pdf.js extrai o texto, parser por código lê as rubricas
// (sem IA, sem custo). Sessão efêmera: analisa, seleciona, exporta CSV.
import { useMemo, useRef, useState, useEffect } from "react";
import { appConfig } from "@/config/app-config";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { extrairTextoPdf } from "@/lib/pdfText";
import { parseContracheque, parseSemad, type Contracheque } from "@/lib/parseContracheque";
import { extrairItensPdf } from "@/lib/pdfText";
import { SpotlightCard } from "@/components/SpotlightCard";
import {
  FileSpreadsheet, Shield, Landmark, Briefcase, ChevronRight, ArrowLeft, Upload,
  FileText, X, Loader2, Check, AlertTriangle, Download, RefreshCw, CheckCircle2,
} from "lucide-react";

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type TipoDoc = "militar" | "semad";
const TIPOS: Record<TipoDoc, { titulo: string; sub: string; icon: typeof Shield; labelGanhos: string }> = {
  militar: { titulo: "Contracheque militar", sub: "Exército · CPEx — comprovante mensal de rendimentos", icon: Shield, labelGanhos: "Receitas" },
  semad: { titulo: "Contracheque SEMAD", sub: "Prefeitura de Manaus — servidores municipais", icon: Landmark, labelGanhos: "Ganhos" },
};

export default function Sheets() {
  useEffect(() => { document.title = `Sheets · ${appConfig.name}`; }, []);
  const [tipo, setTipo] = useState<null | TipoDoc>(null);

  return (
    <div className="w-full space-y-5">
      {!tipo && (
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Sheets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Extração de rubricas de contracheques direto no navegador. Anexe os PDFs, escolha as rubricas e gere a tabela.
          </p>
        </header>
      )}
      {tipo ? <Sessao tipo={tipo} onBack={() => setTipo(null)} /> : <EscolhaTipo onEscolher={setTipo} />}
    </div>
  );
}

// ── Lobby: tipos de documento (cards no padrão do dashboard) ─────────────────
function EscolhaTipo({ onEscolher }: { onEscolher: (t: TipoDoc) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {(Object.keys(TIPOS) as TipoDoc[]).map((k) => {
        const t = TIPOS[k];
        return (
          <SpotlightCard key={k} onClick={() => onEscolher(k)} className="cursor-pointer">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-primary/80">Extração de rubricas</p>
                <p className="font-display text-xl font-medium tracking-tight mt-2">{t.titulo}</p>
                <p className="text-[12.5px] text-muted-foreground mt-1 leading-snug">{t.sub}</p>
                <p className="text-[12px] text-primary mt-4 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                  Abrir sessão <ChevronRight className="h-3.5 w-3.5" />
                </p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 shrink-0">
                <t.icon className="h-7 w-7 text-primary" />
              </div>
            </div>
          </SpotlightCard>
        );
      })}

      <SpotlightCard className="opacity-55 select-none">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Extração de rubricas</p>
            <p className="font-display text-xl font-medium tracking-tight mt-2 text-foreground/70">Holerite CLT / INSS</p>
            <p className="text-[12.5px] text-muted-foreground mt-1 leading-snug">empresas e previdência — mesma estrutura</p>
            <p className="mt-4"><span className="text-[10px] px-2 py-0.5 rounded-full ring-1 text-amber-400 ring-amber-400/25 bg-amber-400/10">em breve</span></p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] ring-1 ring-white/[0.08] shrink-0">
            <Briefcase className="h-7 w-7 text-muted-foreground" />
          </div>
        </div>
      </SpotlightCard>
    </div>
  );
}

// ── Sessão de extração (militar e SEMAD compartilham o fluxo inteiro) ────────
type Fase = "anexar" | "analisando" | "rubricas" | "tabela";

function Sessao({ tipo, onBack }: { tipo: TipoDoc; onBack: () => void }) {
  const meta = TIPOS[tipo];
  const [fase, setFase] = useState<Fase>("anexar");
  const [fila, setFila] = useState<File[]>([]);
  const [docs, setDocs] = useState<Contracheque[]>([]);
  const [progresso, setProgresso] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addArquivos = (lista: FileList | File[]) => {
    const pdfs = Array.from(lista).filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!pdfs.length) { toast.error("Só PDFs por aqui."); return; }
    setFila((prev) => {
      const nomes = new Set(prev.map((f) => f.name));
      return [...prev, ...pdfs.filter((f) => !nomes.has(f.name))];
    });
  };

  const analisar = async () => {
    if (!fila.length) { toast.error("Anexe ao menos um contracheque."); return; }
    setFase("analisando");
    const out: Contracheque[] = [];
    for (let i = 0; i < fila.length; i++) {
      const f = fila[i];
      setProgresso(`Lendo ${f.name} (${i + 1}/${fila.length})`);
      try {
        const buf = await f.arrayBuffer();
        if (tipo === "semad") {
          // SEMAD é colunar: parser posicional (classifica cada valor pela coluna).
          out.push(parseSemad(f.name, await extrairItensPdf(buf)));
        } else {
          const ext = await extrairTextoPdf(f.name, buf);
          if (ext.vazio) { out.push({ name: f.name, ok: false, erro: "sem texto legível (escaneado?)", competencia: null, competenciaLabel: "", nome: null, cpf: null, rubricas: [], totalReceitas: null, totalDespesas: null, totalLiquido: null }); continue; }
          out.push(parseContracheque(f.name, ext.texto));
        }
      } catch (e) {
        out.push({ name: f.name, ok: false, erro: String((e as Error)?.message || e).slice(0, 80), competencia: null, competenciaLabel: "", nome: null, cpf: null, rubricas: [], totalReceitas: null, totalDespesas: null, totalLiquido: null });
      }
    }
    out.sort((a, b) => String(a.competencia || "9999").localeCompare(String(b.competencia || "9999")));
    setDocs(out);
    // Pré-seleciona TODOS os descontos (o objetivo da ferramenta).
    const pre = new Set<string>();
    for (const d of out) for (const r of d.rubricas) if (r.tipo === "desconto") pre.add(r.codigo);
    setSel(pre);
    setFase("rubricas");
  };

  // União de rubricas em todos os docs (código → meta).
  const catalogo = useMemo(() => {
    const m = new Map<string, { codigo: string; descricao: string; tipo: "receita" | "desconto"; meses: number; total: number }>();
    for (const d of docs) {
      const vistos = new Set<string>();
      for (const r of d.rubricas) {
        const e = m.get(r.codigo) || { codigo: r.codigo, descricao: r.descricao, tipo: r.tipo, meses: 0, total: 0 };
        e.total += r.valor;
        if (!vistos.has(r.codigo)) { e.meses++; vistos.add(r.codigo); }
        m.set(r.codigo, e);
      }
    }
    return [...m.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [docs]);
  const descontos = catalogo.filter((c) => c.tipo === "desconto");
  const receitas = catalogo.filter((c) => c.tipo === "receita");
  const okDocs = docs.filter((d) => d.ok);
  const falhas = docs.filter((d) => !d.ok);

  const alternar = (cod: string) => setSel((s) => { const n = new Set(s); n.has(cod) ? n.delete(cod) : n.add(cod); return n; });

  // Tabela: meses nas linhas × rubricas selecionadas nas colunas.
  const colunas = useMemo(() => catalogo.filter((c) => sel.has(c.codigo)), [catalogo, sel]);
  const tabela = useMemo(() => okDocs.map((d) => {
    const porCod = new Map(d.rubricas.map((r) => [r.codigo, r.valor]));
    const celulas = colunas.map((c) => porCod.get(c.codigo) ?? null);
    const totalLinha = celulas.reduce((s: number, v) => s + (v || 0), 0);
    return { doc: d, celulas, totalLinha };
  }), [okDocs, colunas]);
  const totaisColuna = useMemo(() => colunas.map((_, i) => tabela.reduce((s, l) => s + (l.celulas[i] || 0), 0)), [colunas, tabela]);
  const totalGeral = totaisColuna.reduce((s, v) => s + v, 0);
  const titular = okDocs.find((d) => d.nome)?.nome || null;
  const cpfTitular = okDocs.find((d) => d.cpf)?.cpf || null;

  const numBR = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const exportarCSV = () => {
    const linhas: string[] = [];
    linhas.push(["Competência", ...colunas.map((c) => `${c.descricao} (${c.codigo})`), "Total"].join(";"));
    for (const l of tabela) linhas.push([l.doc.competenciaLabel, ...l.celulas.map((v) => (v === null ? "" : numBR(v))), numBR(l.totalLinha)].join(";"));
    linhas.push(["TOTAL", ...totaisColuna.map((v) => numBR(v)), numBR(totalGeral)].join(";"));
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sheets-${(titular || "contracheques").toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copiar = async () => {
    const linhas: string[] = [];
    linhas.push(["Competência", ...colunas.map((c) => c.descricao), "Total"].join("\t"));
    for (const l of tabela) linhas.push([l.doc.competenciaLabel, ...l.celulas.map((v) => (v === null ? "" : numBR(v))), numBR(l.totalLinha)].join("\t"));
    linhas.push(["TOTAL", ...totaisColuna.map((v) => numBR(v)), numBR(totalGeral)].join("\t"));
    await navigator.clipboard.writeText(linhas.join("\n"));
    toast.success("Tabela copiada — cole no Excel ou Google Sheets.");
  };

  const cab = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <button onClick={fase === "tabela" ? () => setFase("rubricas") : fase === "rubricas" ? () => setFase("anexar") : onBack}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> {fase === "tabela" ? "Ajustar rubricas" : fase === "rubricas" ? "Anexar documentos" : "Sheets"}
      </button>
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
        <meta.icon className="h-3.5 w-3.5" /> {meta.titulo}
      </p>
    </div>
  );

  // ── FASE: analisando ──
  if (fase === "analisando") {
    return (
      <div className="space-y-4">{cab}
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.03] min-h-[320px] flex flex-col items-center justify-center gap-3 p-8">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">{progresso || "Analisando…"}</p>
        </div>
      </div>
    );
  }

  // ── FASE: anexar (upload à esquerda, fila à direita) ──
  if (fase === "anexar") {
    return (
      <div className="spy-lock space-y-4">{cab}
        <div className="flex items-center justify-end">
          <Button onClick={analisar} disabled={!fila.length} className="gap-2 h-10 px-5">
            <FileSpreadsheet className="h-4 w-4" /> Analisar ({fila.length})
          </Button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); addArquivos(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed p-10 min-h-[300px] flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${arrastando ? "border-primary/60 bg-primary/[0.06]" : "border-white/[0.12] bg-white/[0.015] hover:border-primary/40 hover:bg-white/[0.03]"}`}>
            <span className="h-14 w-14 rounded-2xl bg-primary/[0.1] ring-1 ring-primary/20 text-primary flex items-center justify-center">
              <Upload className="h-7 w-7" />
            </span>
            <p className="text-[15px] font-medium text-foreground">Arraste os PDFs aqui</p>
            <p className="text-[12px] text-muted-foreground">ou clique para escolher no computador · vários de uma vez</p>
            <input ref={inputRef} type="file" multiple accept="application/pdf,.pdf" className="hidden"
              onChange={(e) => { if (e.target.files) addArquivos(e.target.files); e.target.value = ""; }} />
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 min-h-[300px]">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Fila de análise ({fila.length})
            </p>
            {fila.length === 0 ? (
              <p className="text-sm text-muted-foreground py-14 text-center">Nenhum contracheque anexado.<br />Solte os PDFs ao lado.</p>
            ) : (
              <div className="space-y-1.5 max-h-[52vh] overflow-y-auto scrollbar-thin">
                {fila.map((f) => (
                  <div key={f.name} className="spy-lock flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-[13px] truncate flex-1">{f.name}</span>
                    <span className="text-[10.5px] text-muted-foreground tabular-nums shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => setFila((prev) => prev.filter((x) => x.name !== f.name))} className="text-muted-foreground hover:text-rose-400 transition-colors shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── FASE: rubricas ──
  if (fase === "rubricas") {
    const Grupo = ({ titulo, itens }: { titulo: string; itens: typeof catalogo }) => (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] overflow-hidden">
        <p className="px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02] text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{titulo} ({itens.length})</p>
        <div className="p-3 space-y-1">
          {itens.map((c) => {
            const on = sel.has(c.codigo);
            return (
              <button key={c.codigo} onClick={() => alternar(c.codigo)}
                className={`w-full text-left flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${on ? "bg-primary/[0.08] ring-1 ring-primary/25" : "hover:bg-white/[0.03]"}`}>
                <span className={`h-[18px] w-[18px] rounded-[5px] flex items-center justify-center shrink-0 transition-colors ${on ? "bg-primary text-primary-foreground" : "ring-1 ring-white/20"}`}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="font-mono text-[10.5px] text-muted-foreground shrink-0">{c.codigo}</span>
                <span className="text-[13px] text-foreground/90 truncate flex-1">{c.descricao}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{c.meses} mês(es) · {fmtBRL(c.total)}</span>
              </button>
            );
          })}
          {itens.length === 0 && <p className="text-[12px] text-muted-foreground py-4 text-center">nenhuma</p>}
        </div>
      </div>
    );
    return (
      <div className="spy-lock space-y-4">{cab}
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {okDocs.length} contracheque(s) lido(s){titular ? ` · ${titular}` : ""} — selecione as rubricas da tabela
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">Os descontos já vêm marcados; clique para incluir ou tirar qualquer rubrica.</p>
          </div>
          <Button onClick={() => (sel.size ? setFase("tabela") : toast.error("Selecione ao menos uma rubrica."))} className="gap-2 h-10 px-5 shrink-0">
            <FileSpreadsheet className="h-4 w-4" /> Gerar tabela ({sel.size})
          </Button>
        </div>
        {falhas.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-[12px] text-amber-400 flex items-center gap-2 flex-wrap">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{falhas.map((f) => `${f.name} (${f.erro})`).join(" · ")}</span>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <Grupo titulo="Descontos" itens={descontos} />
          <Grupo titulo={meta.labelGanhos} itens={receitas} />
        </div>
      </div>
    );
  }

  // ── FASE: tabela ──
  return (
    <div className="spy-lock space-y-4">{cab}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> {titular || "Tabela de rubricas"}
          </h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {cpfTitular ? `${cpfTitular} · ` : ""}{tabela.length} competência(s) · {colunas.length} rubrica(s) · total {fmtBRL(totalGeral)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copiar} className="gap-1.5 h-9"><CheckCircle2 className="h-4 w-4" /> Copiar</Button>
          <Button onClick={exportarCSV} className="gap-1.5 h-9"><Download className="h-4 w-4" /> Exportar CSV</Button>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.09] bg-black/25 overflow-x-auto scrollbar-thin">
        <table className="w-full text-[12px] font-mono">
          <thead>
            <tr className="border-b border-white/[0.08] bg-white/[0.02] text-[9.5px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-3 py-2 sticky left-0 bg-[#101014]">Competência</th>
              {colunas.map((c) => (
                <th key={c.codigo} className="text-right font-medium px-3 py-2 whitespace-nowrap" title={c.codigo}>{c.descricao}</th>
              ))}
              <th className="text-right font-medium px-3 py-2 text-primary">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {tabela.map((l) => (
              <tr key={l.doc.name} className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 sticky left-0 bg-[#101014] text-foreground/90 whitespace-nowrap">{l.doc.competenciaLabel}</td>
                {l.celulas.map((v, i) => (
                  <td key={i} className={`px-3 py-1.5 text-right tabular-nums ${v === null ? "text-muted-foreground/40" : "text-foreground/85"}`}>{v === null ? "—" : numBR(v)}</td>
                ))}
                <td className="px-3 py-1.5 text-right tabular-nums text-primary font-medium">{numBR(l.totalLinha)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/[0.1] bg-white/[0.02] font-medium">
              <td className="px-3 py-2 sticky left-0 bg-[#101014] text-foreground">TOTAL</td>
              {totaisColuna.map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums text-foreground">{numBR(v)}</td>)}
              <td className="px-3 py-2 text-right tabular-nums text-primary">{numBR(totalGeral)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => { setFila([]); setDocs([]); setSel(new Set()); setFase("anexar"); }} className="gap-1.5 h-9">
          <RefreshCw className="h-3.5 w-3.5" /> Nova análise
        </Button>
      </div>
    </div>
  );
}
