import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { appConfig } from "@/config/app-config";

export default function Writer() {
  const [searchParams] = useSearchParams();
  const nome = searchParams.get("nome");

  useEffect(() => {
    document.title = nome
      ? `Writer — ${nome} · ${appConfig.name}`
      : `Writer — ${appConfig.name}`;
  }, [nome]);

  // Propaga todos os params pra dentro do iframe
  const qs = searchParams.toString();
  const iframeSrc = `/writer-app/index.html${qs ? `?${qs}` : ""}`;

  return (
    <div className="h-full w-full flex flex-col -m-3 sm:-m-6">
      <iframe
        src={iframeSrc}
        title="AW Writer"
        className="flex-1 w-full border-0"
        allow="clipboard-read; clipboard-write; downloads"
      />
    </div>
  );
}
