import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { appConfig } from "@/config/app-config";
import { supabase } from "@/integrations/supabase/client";
import { useFinderSession } from "@/hooks/useFinderSession";

// Pagina /finder eh uma casca fina. O iframe propriamente dito e o header
// de contexto vivem no <PersistentFinderHost /> renderizado no
// SidebarLayout, que mantem o iframe vivo entre navegacoes (analise nao
// morre quando o usuario minimiza pra ver o cliente, esteira, etc).
export default function Finder() {
  const [searchParams] = useSearchParams();
  const cliente = searchParams.get("cliente");
  const nome = searchParams.get("nome");
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
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

  // Inicia/reusa a sessao persistente. Sobrescreve se ja tem sessao pra
  // outro cliente. Atualiza driveUrl quando ela chega.
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

  // Renderiza placeholder transparente — o conteudo real vem do
  // PersistentFinderHost posicionado absoluto sobre essa area.
  return <div className="h-full w-full -m-3 sm:-m-6" />;
}
