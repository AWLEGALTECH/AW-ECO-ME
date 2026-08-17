import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Folder, FolderPlus, FolderOpen, ChevronRight, ChevronLeft, ExternalLink,
  Loader2, Check, X, FileText, FileSpreadsheet, FileImage, FileVideo, File,
  Presentation, FolderSymlink, Link2, RefreshCw, HardDrive, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

interface ItemDrive {
  id: string; name: string; mimeType: string;
  size?: string; modifiedTime?: string; webViewLink?: string;
}
interface Nivel { id: string; nome: string }

// Ícone pelo tipo do arquivo. Documento não é tudo igual: reconhecer a
// planilha do relatório no meio de dez PDFs é metade do trabalho.
function iconeDe(mime: string) {
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv"))
    return { Icon: FileSpreadsheet, cor: "text-emerald-400" };
  if (mime.includes("document") || mime.includes("word") || mime === "text/plain")
    return { Icon: FileText, cor: "text-sky-400" };
  if (mime.includes("presentation") || mime.includes("powerpoint"))
    return { Icon: Presentation, cor: "text-amber-400" };
  if (mime.startsWith("image/")) return { Icon: FileImage, cor: "text-violet-400" };
  if (mime.startsWith("video/")) return { Icon: FileVideo, cor: "text-rose-400" };
  if (mime === "application/pdf") return { Icon: FileText, cor: "text-rose-400" };
  return { Icon: File, cor: "text-muted-foreground" };
}

const fmtTam = (b?: string) => {
  const n = Number(b || 0);
  if (!n) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};

// Erro da função com o corpo preservado: além da mensagem, a função diz se o
// que falta é a raiz dos projetos e qual conta precisa de acesso.
interface ErroDrive extends Error { precisaRaiz?: boolean; serviceAccount?: string }

const monta = (corpo: any, fallback: string): ErroDrive => {
  const e = new Error(
    corpo?.error ? (corpo.dica ? `${corpo.error}. ${corpo.dica}` : corpo.error) : fallback,
  ) as ErroDrive;
  e.precisaRaiz = !!corpo?.precisa_raiz;
  e.serviceAccount = corpo?.service_account;
  return e;
};

// O invoke devolve só "non-2xx status code" quando a função responde com erro.
// O motivo de verdade está no corpo, então lê de lá antes de desistir.
const chamar = async (acao: string, payload: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("projeto-drive", {
    body: { acao, ...payload },
  });
  if (error) {
    let corpo: any = null;
    try { corpo = await (error as any)?.context?.json?.(); } catch { /* corpo ilegível */ }
    throw monta(corpo, error.message);
  }
  if (data?.error) throw monta(data, "Falha no Drive");
  return data;
};

export function ProjetoDrive({ projetoId, folderId, folderUrl, corChip, onVinculada, onFechar }: {
  projetoId: string;
  folderId: string | null;
  folderUrl: string | null;
  corChip: string;
  onVinculada: () => void;
  onFechar: () => void;
}) {
  // Caminho navegado. O primeiro nível é sempre a pasta do projeto, então o
  // usuário nunca sobe pra fora dela por engano.
  const [caminho, setCaminho] = useState<Nivel[]>([]);
  const [pastas, setPastas] = useState<ItemDrive[]>([]);
  const [arquivos, setArquivos] = useState<ItemDrive[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [novaPasta, setNovaPasta] = useState(false);
  const [nomePasta, setNomePasta] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [movendo, setMovendo] = useState(false);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");

  const [linkInput, setLinkInput] = useState("");
  const [vinculando, setVinculando] = useState(false);

  // Onde ficam todas as pastas de projeto. Só aparece quando nem a criação
  // automática deu certo, e some pra sempre depois de respondida.
  const [pedeRaiz, setPedeRaiz] = useState<{ conta?: string } | null>(null);
  const [linkRaiz, setLinkRaiz] = useState("");
  const [criandoAuto, setCriandoAuto] = useState(false);

  const atual = caminho[caminho.length - 1] || null;

  const listar = useCallback(async (id: string, nome?: string, empilhar = false) => {
    setCarregando(true); setErro(null);
    try {
      const d = await chamar("listar", { folder_id: id });
      setPastas(d.pastas || []);
      setArquivos(d.arquivos || []);
      setCaminho((old) => empilhar
        ? [...old, { id, nome: nome || d.pasta?.nome || "Pasta" }]
        : [{ id, nome: nome || d.pasta?.nome || "Documentos" }]);
      setSel(new Set());
    } catch (e) {
      setErro(String((e as Error)?.message || e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (folderId) { setCaminho([]); listar(folderId); }
  }, [folderId, listar]);

  // A pasta do projeto se cria sozinha na primeira abertura, como a do
  // pré-cliente. Abrir "Documentos" já é o pedido; um botão a mais seria só
  // uma pergunta cuja resposta é sempre sim.
  const criarAuto = useCallback(async () => {
    setCriandoAuto(true);
    try {
      await chamar("criar_raiz", { projeto_id: projetoId });
      onVinculada();
    } catch (e) {
      const err = e as ErroDrive;
      if (err.precisaRaiz) setPedeRaiz({ conta: err.serviceAccount });
      else toast.error(String(err?.message || e));
    } finally { setCriandoAuto(false); }
  }, [projetoId, onVinculada]);

  // Uma tentativa por projeto: falhando, a tela oferece o caminho manual em
  // vez de insistir em laço.
  const tentado = useRef<string | null>(null);
  useEffect(() => {
    if (folderId || tentado.current === projetoId) return;
    tentado.current = projetoId;
    criarAuto();
  }, [folderId, projetoId, criarAuto]);

  const recarregar = () => { if (atual) listar(atual.id, atual.nome, false); };
  const voltarPara = (i: number) => {
    const alvo = caminho[i];
    setCaminho(caminho.slice(0, i));
    listar(alvo.id, alvo.nome, true);
  };

  /* ── Sem pasta ainda ── */
  if (!folderId) {
    const criar = async () => {
      setVinculando(true);
      try {
        await chamar("criar_raiz", { projeto_id: projetoId });
        toast.success("Pasta criada no Drive");
        onVinculada();
      } catch (e) {
        const err = e as ErroDrive;
        if (err.precisaRaiz) setPedeRaiz({ conta: err.serviceAccount });
        else toast.error(String(err?.message || e));
      } finally { setVinculando(false); }
    };

    // Define a raiz e já emenda a criação da pasta: quem clicou em criar
    // continua querendo criar, não configurar.
    const salvarRaiz = async () => {
      if (!linkRaiz.trim()) { toast.error("Cole o link da pasta."); return; }
      setVinculando(true);
      try {
        const d = await chamar("definir_raiz", { folder_url: linkRaiz.trim() });
        toast.success(`Projetos vão para "${d.nome}"`);
        setPedeRaiz(null); setLinkRaiz("");
        await chamar("criar_raiz", { projeto_id: projetoId });
        onVinculada();
      } catch (e) { toast.error(String((e as Error)?.message || e)); }
      finally { setVinculando(false); }
    };
    const vincular = async () => {
      if (!linkInput.trim()) { toast.error("Cole o link da pasta."); return; }
      setVinculando(true);
      try {
        const d = await chamar("vincular", { projeto_id: projetoId, folder_url: linkInput.trim() });
        toast.success(`Pasta "${d.nome}" vinculada`);
        setLinkInput("");
        onVinculada();
      } catch (e) { toast.error(String((e as Error)?.message || e)); }
      finally { setVinculando(false); }
    };

    return (
      <div className="h-full flex flex-col p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className={cn("h-8 w-8 rounded-lg grid place-items-center ring-1 shrink-0", corChip)}>
            <HardDrive className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wider">Documentos</p>
            <p className="text-[11px] text-muted-foreground">
              {criandoAuto ? "Preparando a pasta no Drive" : "Sem pasta no Drive ainda"}
            </p>
          </div>
          <button onClick={onFechar} title="Fechar"
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {criandoAuto ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ ease: EASE, duration: 0.2 }}
            className="flex-1 grid place-items-center text-center px-2">
            <div>
              <FolderPlus className="h-6 w-6 text-primary/70 mx-auto animate-pulse" />
              <p className="text-[12px] mt-2.5">Criando a pasta do projeto</p>
              <p className="text-[11px] text-muted-foreground mt-1">Vai ficar dentro de PROJETOS - AW</p>
            </div>
          </motion.div>
        ) : pedeRaiz ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ ease: EASE, duration: 0.22 }}
            className="space-y-2 rounded-xl ring-1 ring-primary/25 bg-primary/[0.06] p-3">
            <p className="text-[12px] font-semibold">Onde ficam os projetos?</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Cole o link da pasta do Drive que guarda todos os projetos. Cada projeto
              vira uma subpasta dela. Perguntamos isso uma vez só.
            </p>
            <Input value={linkRaiz} onChange={(e) => setLinkRaiz(e.target.value)} autoFocus
              placeholder="https://drive.google.com/drive/folders/..."
              className="h-8 text-[12px]"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarRaiz(); } }} />
            <div className="flex gap-1.5">
              <Button size="sm" className="flex-1" onClick={salvarRaiz} disabled={vinculando || !linkRaiz.trim()}>
                {vinculando ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                Salvar e criar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPedeRaiz(null)} disabled={vinculando}>
                Cancelar
              </Button>
            </div>
            {pedeRaiz.conta && (
              <p className="text-[10.5px] text-muted-foreground/80 leading-snug break-all">
                A pasta precisa estar compartilhada como Editor com{" "}
                <span className="text-foreground/90">{pedeRaiz.conta}</span>
              </p>
            )}
          </motion.div>
        ) : (
          <>
            <Button size="sm" className="w-full" onClick={criar} disabled={vinculando}>
              {vinculando ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FolderPlus className="h-3.5 w-3.5 mr-1.5" />}
              Criar pasta do projeto
            </Button>

            <div className="flex items-center gap-2">
              <span className="h-px flex-1 bg-border/60" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">ou</span>
              <span className="h-px flex-1 bg-border/60" />
            </div>

            <div className="space-y-1.5">
              <Input value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
                placeholder="Cole o link de uma pasta do Drive"
                className="h-8 text-[12px]"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); vincular(); } }} />
              <Button size="sm" variant="outline" className="w-full" onClick={vincular} disabled={vinculando || !linkInput.trim()}>
                <Link2 className="h-3.5 w-3.5 mr-1.5" /> Vincular pasta existente
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  /* ── Explorador ── */
  const criarSubpasta = async () => {
    const n = nomePasta.trim();
    if (!n || !atual) { setNovaPasta(false); return; }
    try {
      await chamar("criar_subpasta", { parent_id: atual.id, nome: n });
      setNomePasta(""); setNovaPasta(false);
      recarregar();
    } catch (e) { toast.error(String((e as Error)?.message || e)); }
  };

  const salvarNome = async (id: string) => {
    const n = nomeNovo.trim();
    setRenomeando(null);
    if (!n) return;
    try {
      await chamar("renomear", { file_id: id, nome: n });
      recarregar();
    } catch (e) { toast.error(String((e as Error)?.message || e)); }
  };

  const moverPara = async (destinoId: string, destinoNome: string) => {
    if (!sel.size) return;
    setMovendo(true);
    try {
      const d = await chamar("mover", { file_ids: Array.from(sel), destino_id: destinoId });
      if (d.erros?.length) toast.error(`${d.movidos} movidos, ${d.erros.length} falharam`);
      else toast.success(`${d.movidos} ${d.movidos === 1 ? "arquivo movido" : "arquivos movidos"} para ${destinoNome}`);
      setSel(new Set());
      recarregar();
    } catch (e) { toast.error(String((e as Error)?.message || e)); }
    finally { setMovendo(false); }
  };

  const toggleSel = (id: string) =>
    setSel((old) => { const n = new Set(old); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const paiParaVoltar = caminho.length > 1 ? caminho[caminho.length - 2] : null;

  return (
    <div className="h-full flex flex-col">
      {/* Cabeçalho */}
      <div className="p-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <span className={cn("h-8 w-8 rounded-lg grid place-items-center ring-1 shrink-0", corChip)}>
            <HardDrive className="h-4 w-4" />
          </span>
          <p className="text-[12px] font-semibold uppercase tracking-wider flex-1 min-w-0 truncate">
            Documentos
          </p>
          <button onClick={recarregar} title="Atualizar" disabled={carregando}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors">
            <RefreshCw className={cn("h-3.5 w-3.5", carregando && "animate-spin")} />
          </button>
          {folderUrl && (
            <a href={folderUrl} target="_blank" rel="noopener noreferrer" title="Abrir no Drive"
              className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button onClick={onFechar} title="Fechar"
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Caminho */}
        <div className="flex items-center gap-0.5 flex-wrap mt-2 text-[11px]">
          {caminho.map((n, i) => (
            <span key={n.id} className="inline-flex items-center gap-0.5 min-w-0">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
              <button
                onClick={() => i < caminho.length - 1 && voltarPara(i)}
                disabled={i === caminho.length - 1}
                className={cn("truncate max-w-[9rem] px-1 py-0.5 rounded",
                  i === caminho.length - 1
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]")}>
                {n.nome}
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Barra de seleção */}
      <AnimatePresence>
        {sel.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            transition={{ ease: EASE, duration: 0.18 }}
            className="px-3 py-2 border-b border-primary/20 bg-primary/[0.06] shrink-0 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-primary font-medium">
                {sel.size} {sel.size === 1 ? "selecionado" : "selecionados"}
              </span>
              <button onClick={() => setSel(new Set())}
                className="text-[11px] text-muted-foreground hover:text-foreground ml-auto">
                Limpar
              </button>
            </div>
            <p className="text-[10.5px] text-muted-foreground mt-1.5">Mover para:</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {paiParaVoltar && (
                <button onClick={() => moverPara(paiParaVoltar.id, paiParaVoltar.nome)} disabled={movendo}
                  className="text-[10.5px] px-2 py-1 rounded-md ring-1 ring-white/[0.1] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors inline-flex items-center gap-1">
                  <ChevronLeft className="h-3 w-3" /> {paiParaVoltar.nome}
                </button>
              )}
              {pastas.map((p) => (
                <button key={p.id} onClick={() => moverPara(p.id, p.name)} disabled={movendo}
                  className="text-[10.5px] px-2 py-1 rounded-md ring-1 ring-primary/25 bg-primary/10 text-primary hover:bg-primary/20 transition-colors inline-flex items-center gap-1 max-w-full">
                  {movendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderSymlink className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
              {!pastas.length && !paiParaVoltar && (
                <span className="text-[10.5px] text-muted-foreground/70">Crie uma subpasta primeiro.</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
        {erro ? (
          <div className="p-3 text-[11.5px] text-rose-300 leading-snug">{erro}</div>
        ) : carregando && !pastas.length && !arquivos.length ? (
          <div className="p-6 text-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {/* Pastas primeiro, como em qualquer explorador */}
            {pastas.map((p) => (
              <motion.div key={p.id} layout
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ ease: EASE, duration: 0.16 }}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.05] transition-colors">
                {renomeando === p.id ? (
                  <>
                    <Folder className="h-4 w-4 text-amber-400 shrink-0" />
                    <Input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} autoFocus
                      onBlur={() => salvarNome(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); salvarNome(p.id); }
                        if (e.key === "Escape") setRenomeando(null);
                      }}
                      className="h-6 text-[12px] px-1.5 flex-1" />
                  </>
                ) : (
                  <>
                    <button onClick={() => listar(p.id, p.name, true)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      <Folder className="h-4 w-4 text-amber-400 shrink-0" />
                      <span className="text-[12.5px] truncate">{p.name}</span>
                    </button>
                    <button onClick={() => { setRenomeando(p.id); setNomeNovo(p.name); }} title="Renomear"
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-all shrink-0">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  </>
                )}
              </motion.div>
            ))}

            {/* Arquivos */}
            {arquivos.map((f) => {
              const { Icon, cor } = iconeDe(f.mimeType);
              const marcado = sel.has(f.id);
              const tam = fmtTam(f.size);
              return (
                <motion.div key={f.id} layout
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ ease: EASE, duration: 0.16 }}
                  className={cn("group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                    marcado ? "bg-primary/10 ring-1 ring-primary/25" : "hover:bg-white/[0.05]")}>
                  <button onClick={() => toggleSel(f.id)} title="Selecionar"
                    className={cn("h-4 w-4 rounded-[4px] grid place-items-center shrink-0 transition-all",
                      marcado ? "bg-primary text-primary-foreground" : "ring-1 ring-white/20 opacity-0 group-hover:opacity-100")}>
                    {marcado && <Check className="h-2.5 w-2.5" />}
                  </button>

                  {renomeando === f.id ? (
                    <>
                      <Icon className={cn("h-4 w-4 shrink-0", cor)} />
                      <Input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} autoFocus
                        onBlur={() => salvarNome(f.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); salvarNome(f.id); }
                          if (e.key === "Escape") setRenomeando(null);
                        }}
                        className="h-6 text-[12px] px-1.5 flex-1" />
                    </>
                  ) : (
                    <>
                      <a href={f.webViewLink} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 flex-1 min-w-0">
                        <Icon className={cn("h-4 w-4 shrink-0", cor)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] truncate">{f.name}</span>
                          {tam && <span className="block text-[10px] text-muted-foreground">{tam}</span>}
                        </span>
                      </a>
                      <button onClick={() => { setRenomeando(f.id); setNomeNovo(f.name); }} title="Renomear"
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-all shrink-0">
                        <Pencil className="h-3 w-3" />
                      </button>
                      <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                    </>
                  )}
                </motion.div>
              );
            })}

            {!carregando && !pastas.length && !arquivos.length && (
              <div className="py-8 text-center">
                <FolderOpen className="h-6 w-6 text-muted-foreground/40 mx-auto" />
                <p className="text-[11.5px] text-muted-foreground mt-2">Pasta vazia</p>
              </div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Rodapé */}
      <div className="p-2 border-t border-white/[0.06] shrink-0">
        {novaPasta ? (
          <div className="flex items-center gap-1.5">
            <Input value={nomePasta} onChange={(e) => setNomePasta(e.target.value)} autoFocus
              placeholder="Nome da subpasta" className="h-7 text-[12px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); criarSubpasta(); }
                if (e.key === "Escape") { setNovaPasta(false); setNomePasta(""); }
              }} />
            <button onClick={criarSubpasta}
              className="h-7 w-7 grid place-items-center rounded-md bg-primary text-primary-foreground shrink-0">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { setNovaPasta(false); setNomePasta(""); }}
              className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-white/[0.06] shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button onClick={() => setNovaPasta(true)}
            className="w-full py-1.5 rounded-lg text-[12px] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors inline-flex items-center justify-center gap-1.5">
            <FolderPlus className="h-3.5 w-3.5" /> Nova subpasta
          </button>
        )}
      </div>
    </div>
  );
}
