import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { appConfig } from "@/config/app-config";
import { supabase } from "@/integrations/supabase/client";
import { useFinderSession } from "@/hooks/useFinderSession";
import { FinderAnaliseComercial } from "@/components/FinderAnaliseComercial";

// Pagina /finder tem dois modos:
//
// 1. STANDALONE (sem ?cliente=...&nome=...): user clicou em "Finder" no
//    sidebar pra usar a ferramenta livremente. Renderiza o iframe
//    direto, sem session persistente. Esse eh o caso de uso comum (e
//    o que estava QUEBRADO no refactor anterior — a tela ficava em
//    branco porque so o PersistentFinderHost renderizava iframe, e ele
//    so renderiza com sessao ativa).
//
// 2. CLIENTE-LINKED (com ?cliente=&nome=): user clicou em "Iniciar
//    analise" pra um cliente especifico. Inicia uma sessao persistente
//    no contexto FinderSession e deixa o <PersistentFinderHost />
//    renderizar o iframe (que sobrevive a navegacoes pra ficar rodando
//    em segundo plano com pill no topo).
//
// Quando ha sessao ativa, esta pagina vira so um placeholder — o iframe
// vem do PersistentFinderHost sobreposto. Quando NAO ha, renderiza o
// iframe local direto.
export default function Finder() {
  const [searchParams] = useSearchParams();
  const cliente = searchParams.get("cliente");
  const nome = searchParams.get("nome");
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { active, iniciar } = useFinderSession();

  useEffect(() => {
    document.title = nome
      ? `Finder — ${nome} · ${appConfig.name}`
      : `Finder — ${appConfig.name}`;
  }, [nome]);

  useEffect(() => {
    if (!cliente) return;
    (async () => {
      const { data } = await supabase
        .from("clientes")
        .select("drive_folder_url")
        .eq("id", cliente)
        .single();
      const url = (data as any)?.drive_folder_url;
      if (url) setDriveUrl(url);
    })();
  }, [cliente]);

  // Modo cliente-linked: inicia/reusa a sessao persistente.
  useEffect(() => {
    if (!cliente || !nome) return;
    const driveFolderId = driveUrl?.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] || null;
    if (active && active.clienteId === cliente) {
      if (driveUrl && !active.driveUrl) {
        iniciar({ ...active, driveUrl, driveFolderId });
      }
      return;
    }
    iniciar({
      clienteId: cliente,
      nome,
      driveUrl,
      driveFolderId,
      startedAt: Date.now(),
    });
  }, [cliente, nome, driveUrl, active, iniciar]);

  // Quando ha sessao ativa, o iframe eh renderizado pelo
  // <PersistentFinderHost /> sobreposto a essa area. So devolvemos um
  // placeholder com a mesma altura pra preservar o layout.
  if (active) {
    return <div className="h-full w-full -m-3 sm:-m-6" />;
  }

  // Modo standalone: usa o iframe local. Eh o caminho que a Adria pega
  // quando clica em "Finder" no sidebar.
  return (
    <div className="h-full w-full flex flex-col -m-3 sm:-m-6 relative">
      {carregando && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Carregando Finder…</p>
            <p className="text-xs text-muted-foreground mt-1">Inicializando motor de auditoria</p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="/finder-app/index.html"
        title="AW Finder"
        onLoad={() => setCarregando(false)}
        className="flex-1 w-full border-0"
        allow="clipboard-read; clipboard-write; downloads"
      />
      {/* Captura a análise emitida pelo Finder (evento aw-finder:analysis-ready)
          e permite salvar a "análise comercial" marcando rubricas não ajuizáveis. */}
      <FinderAnaliseComercial iframeRef={iframeRef} />
    </div>
  );
}
