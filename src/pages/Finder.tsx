import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { appConfig } from "@/config/app-config";

export default function Finder() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const cliente = searchParams.get("cliente");
  const nome = searchParams.get("nome");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    document.title = nome
      ? `Finder — ${nome} · ${appConfig.name}`
      : `Finder — ${appConfig.name}`;
  }, [nome]);

  const iframeQs = new URLSearchParams();
  if (cliente) iframeQs.set("cliente", cliente);
  if (nome)    iframeQs.set("nome", nome);
  const iframeSrc = `/finder-app/index.html${iframeQs.toString() ? `?${iframeQs.toString()}` : ""}`;

  const finalizarAnalise = () => {
    if (cliente) navigate(`/clientes/${cliente}`);
    else navigate("/clientes");
  };

  return (
    <div className="h-full w-full flex flex-col -m-3 sm:-m-6 relative">
      {/* Barra de contexto: aparece quando o Finder foi aberto a partir de um
          cliente, deixa explicita a opção de finalizar e voltar pro perfil
          com a pipeline atualizada. */}
      {cliente && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/60 bg-card/40 backdrop-blur">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <button
              onClick={finalizarAnalise}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Voltar pro perfil do cliente"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <span className="truncate">
              Analisando extratos de <strong className="text-foreground">{nome || "cliente"}</strong>
            </span>
          </div>
          <button
            onClick={finalizarAnalise}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
            title="Encerra a sessão no Finder e volta pro perfil do cliente com a pipeline atualizada"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Finalizar análise
          </button>
        </div>
      )}

      {carregando && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Carregando Finder…</p>
            <p className="text-xs text-muted-foreground mt-1">
              {nome ? `Pronto pra analisar extratos de ${nome}` : "Inicializando motor de auditoria"}
            </p>
          </div>
        </div>
      )}
      <iframe
        src={iframeSrc}
        title="AW Finder"
        onLoad={() => setCarregando(false)}
        className="flex-1 w-full border-0"
        allow="clipboard-read; clipboard-write; downloads"
      />
    </div>
  );
}
