import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { appConfig } from "@/config/app-config";

export default function Finder() {
  const [searchParams] = useSearchParams();
  const cliente = searchParams.get("cliente");
  const nome = searchParams.get("nome");

  useEffect(() => {
    document.title = nome
      ? `Finder — ${nome} · ${appConfig.name}`
      : `Finder — ${appConfig.name}`;
  }, [nome]);

  // Propaga os params pro iframe (que vai ler na URL e mostrar banner)
  const iframeQs = new URLSearchParams();
  if (cliente) iframeQs.set("cliente", cliente);
  if (nome)    iframeQs.set("nome", nome);
  const iframeSrc = `/finder-app/index.html${iframeQs.toString() ? `?${iframeQs.toString()}` : ""}`;

  return (
    <div className="h-full w-full flex flex-col -m-3 sm:-m-6">
      <iframe
        src={iframeSrc}
        title="AW Finder"
        className="flex-1 w-full border-0"
        allow="clipboard-read; clipboard-write; downloads"
      />
    </div>
  );
}
