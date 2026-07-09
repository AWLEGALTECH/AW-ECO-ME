import { useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, FolderOpen, Minimize2 } from "lucide-react";
import { useFinderSession } from "@/hooks/useFinderSession";
import { FinderCienciaComercial } from "@/components/FinderCienciaComercial";

// Iframe do Finder montado uma unica vez no SidebarLayout. Quando o user
// esta em /finder, ele aparece sobre o Outlet com o header de contexto
// no topo. Quando o user navega pra outra rota, ele fica fora da tela
// (left: -200vw) mas permanece montado pra que o motor de auditoria
// continue rodando em segundo plano.
//
// Sem isso, navegar pra qualquer outra rota desmontaria o iframe e
// perderia o estado da analise — usuario tinha que esperar o spinner
// "Cruzando dados" terminar antes de ir pra qualquer lugar.
export function PersistentFinderHost() {
  const { active, encerrar, marcarConcluido } = useFinderSession();
  const location = useLocation();
  const navigate = useNavigate();
  const visivel = location.pathname.startsWith("/finder");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const iframeSrc = useMemo(() => {
    if (!active) return null;
    const qs = new URLSearchParams();
    qs.set("cliente", active.clienteId);
    qs.set("nome", active.nome);
    if (active.driveUrl) qs.set("drive", active.driveUrl);
    if (active.driveFolderId) qs.set("drive_folder_id", active.driveFolderId);
    return `/finder-app/index.html?${qs.toString()}`;
  }, [active]);

  if (!active || !iframeSrc) return null;

  const minimizar = () => {
    navigate(`/clientes/${active.clienteId}`);
  };
  const finalizar = () => {
    marcarConcluido();
    const id = active.clienteId;
    encerrar();
    navigate(`/clientes/${id}`);
  };

  return (
    <div
      // Quando visivel: ocupa toda a area do Outlet (cobre tudo).
      // Quando minimizado: sai pra fora da tela mas permanece montado.
      className={
        visivel
          ? "absolute inset-0 z-30 bg-background flex flex-col"
          : "fixed top-0 left-[-200vw] w-screen h-screen pointer-events-none"
      }
      aria-hidden={!visivel}
    >
      {/* Header de contexto — so visivel quando estamos em /finder. */}
      {visivel && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/60 bg-card/40 backdrop-blur shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <button
              onClick={minimizar}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Voltar pro perfil do cliente (Finder continua rodando em segundo plano)"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <span className="truncate">
              Analisando extratos de <strong className="text-foreground">{active.nome}</strong>
            </span>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {active.driveUrl && (
              <a
                href={active.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-card/80 hover:bg-card border border-border/70 hover:border-primary/60 text-xs font-medium transition-colors"
                title="Abre a pasta do cliente no Google Drive"
              >
                <FolderOpen className="h-3.5 w-3.5 text-primary" />
                Pasta no Drive
              </a>
            )}
            <button
              onClick={minimizar}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-card/80 hover:bg-card border border-border/70 hover:border-primary/60 text-xs font-medium transition-colors"
              title="Continuar em segundo plano — você verá uma pill no topo da tela"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Minimizar
            </button>
            <button
              onClick={finalizar}
              className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              title="Encerra a sessão no Finder e volta pro perfil do cliente"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Finalizar análise
            </button>
          </div>
        </div>
      )}

      {/* Ciência da análise comercial DENTRO da análise primária: mostra o que
          foi bloqueado no comercial pra não ser reconsiderado aqui. */}
      {visivel && <FinderCienciaComercial clienteId={active.clienteId} nome={active.nome} iframeRef={iframeRef} />}

      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="AW Finder"
        className="flex-1 w-full border-0"
        allow="clipboard-read; clipboard-write; downloads"
      />
    </div>
  );
}
