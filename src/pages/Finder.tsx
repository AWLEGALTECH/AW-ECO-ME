import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { appConfig } from "@/config/app-config";

export default function Finder() {
  const [searchParams] = useSearchParams();
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

  return (
    <div className="h-full w-full flex flex-col -m-3 sm:-m-6 relative">
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
