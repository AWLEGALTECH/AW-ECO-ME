import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { appConfig } from "@/config/app-config";

export default function Writer() {
  const [searchParams] = useSearchParams();
  const nome = searchParams.get("nome");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    document.title = nome
      ? `Writer — ${nome} · ${appConfig.name}`
      : `Writer — ${appConfig.name}`;
  }, [nome]);

  const qs = searchParams.toString();
  const iframeSrc = `/writer-app/index.html${qs ? `?${qs}` : ""}`;

  return (
    <div className="h-full w-full flex flex-col -m-3 sm:-m-6 relative">
      {carregando && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Carregando Writer…</p>
            <p className="text-xs text-muted-foreground mt-1">
              {nome ? `Pré-carregando dados de ${nome}` : "Inicializando templates e módulos"}
            </p>
          </div>
        </div>
      )}
      <iframe
        src={iframeSrc}
        title="AW Writer"
        onLoad={() => setCarregando(false)}
        className="flex-1 w-full border-0"
        allow="clipboard-read; clipboard-write; downloads"
      />
    </div>
  );
}
