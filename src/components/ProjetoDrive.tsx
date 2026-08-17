import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Folder, FolderOpen, ChevronRight, ExternalLink, Loader2, X,
  FileText, FileSpreadsheet, FileImage, FileVideo, File, Presentation,
  Link2, RefreshCw, HardDrive, CornerLeftUp, FolderPlus, Check,
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

/**
 * Janela de leitura do Drive do projeto.
 *
 * Só navega e abre. Enviar arquivo, criar subpasta, renomear e mover saíram:
 * quem organiza a pasta é o Drive, que faz isso melhor e é onde as pessoas já
 * estão. Duplicar essas ações aqui só criava duas formas de fazer a mesma
 * coisa, uma delas pior. O que o painel dá é o atalho: ver o que tem na pasta
 * do projeto sem sair do quadro, e abrir o documento certo em um clique.
 *
 * A pasta do projeto continua nascendo sozinha, porque isso não é manipular
 * conteúdo: é o vínculo entre o projeto e o lugar onde ele mora.
 */
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

  const [linkInput, setLinkInput] = useState("");
  const [vinculando, setVinculando] = useState(false);
  const [criandoAuto, setCriandoAuto] = useState(false);

  // Onde ficam todas as pastas de projeto. Só aparece quando nem a criação
  // automática deu certo, e some pra sempre depois de respondida.
  const [pedeRaiz, setPedeRaiz] = useState<{ conta?: string } | null>(null);
  const [linkRaiz, setLinkRaiz] = useState("");

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

    // Define a raiz e já emenda a criação da pasta do projeto.
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
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPedeRaiz(null)} disabled={vinculando}>
                Cancelar
              </Button>
            </div>
            {pedeRaiz.conta && (
              <p className="text-[10.5px] text-muted-foreground/80 leading-snug break-all">
                A pasta precisa estar compartilhada com{" "}
                <span className="text-foreground/90">{pedeRaiz.conta}</span>
              </p>
            )}
          </motion.div>
        ) : (
          <div className="space-y-1.5">
            <Input value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
              placeholder="Cole o link de uma pasta do Drive"
              className="h-8 text-[12px]"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); vincular(); } }} />
            <Button size="sm" variant="outline" className="w-full" onClick={vincular} disabled={vinculando || !linkInput.trim()}>
              <Link2 className="h-3.5 w-3.5 mr-1.5" /> Vincular pasta existente
            </Button>
          </div>
        )}
      </div>
    );
  }

  /* ── Explorador ── */
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
            <a href={folderUrl} target="_blank" rel="noopener noreferrer" title="Abrir a pasta no Drive"
              className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button onClick={onFechar} title="Fechar"
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Caminho, com o voltar colado nele: sair de uma pasta é a ação mais
            repetida aqui e não devia depender de mirar no nome do pai. */}
        <div className="flex items-center gap-0.5 flex-wrap mt-2 text-[11px]">
          {paiParaVoltar && (
            <button onClick={() => voltarPara(caminho.length - 2)} title={`Voltar para ${paiParaVoltar.nome}`}
              className="h-5 w-5 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-colors shrink-0 mr-1">
              <CornerLeftUp className="h-3.5 w-3.5" />
            </button>
          )}
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
              <motion.button key={p.id} layout
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ ease: EASE, duration: 0.16 }}
                onClick={() => listar(p.id, p.name, true)}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05] transition-colors">
                <Folder className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="text-[12.5px] truncate flex-1">{p.name}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              </motion.button>
            ))}

            {/* Arquivos: clique abre no Drive, que é onde eles se editam */}
            {arquivos.map((f) => {
              const { Icon, cor } = iconeDe(f.mimeType);
              const tam = fmtTam(f.size);
              return (
                <motion.a key={f.id} layout
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ ease: EASE, duration: 0.16 }}
                  href={f.webViewLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.05] transition-colors">
                  <Icon className={cn("h-4 w-4 shrink-0", cor)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] truncate">{f.name}</span>
                    {tam && <span className="block text-[10px] text-muted-foreground">{tam}</span>}
                  </span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                </motion.a>
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

      {/* Rodapé: o painel só lê, e o Drive é onde se mexe */}
      {folderUrl && (
        <div className="p-2 border-t border-white/[0.06] shrink-0">
          <a href={folderUrl} target="_blank" rel="noopener noreferrer"
            className="w-full py-1.5 rounded-lg text-[12px] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors inline-flex items-center justify-center gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" /> Gerenciar no Drive
          </a>
        </div>
      )}
    </div>
  );
}
