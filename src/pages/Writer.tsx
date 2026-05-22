import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { appConfig } from "@/config/app-config";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Eventos que o iframe do writer manda pro parent (aw-eco-me) via postMessage.
// Centralizam as escritas de demandas que precisariam de privilegio
// autenticado — em vez de afrouxar RLS pra anon, o parent (autenticado) faz.
type WriterMessage =
  | {
      type: "aw-eco-me:pecaFinalizada";
      payload: { demandaId: string; driveUrl: string };
    }
  | {
      type: "aw-eco-me:cadeiaCompleta";
      payload: { cliente: string };
    };

export default function Writer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const nome = searchParams.get("nome");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    document.title = nome
      ? `Writer — ${nome} · ${appConfig.name}`
      : `Writer — ${appConfig.name}`;
  }, [nome]);

  useEffect(() => {
    const handler = async (e: MessageEvent<WriterMessage>) => {
      if (e.origin !== window.location.origin) return;
      const msg = e.data;
      if (!msg || typeof msg !== "object" || !("type" in msg)) return;

      if (msg.type === "aw-eco-me:pecaFinalizada") {
        const { demandaId, driveUrl } = msg.payload;
        const { error } = await supabase
          .from("demandas" as any)
          .update({
            etapa: "pronta_para_protocolo",
            status: "pendente",
            peca_drive_url: driveUrl || null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", demandaId);
        const ok = !error;
        if (error) {
          console.error("[writer-parent] erro ao finalizar peça:", error);
          toast.error("Erro ao registrar peça pronta: " + error.message);
        } else {
          toast.success("Peça registrada nos Espelhos de Protocolo");
        }
        // ack pro iframe pra ele saber se segue pra próxima
        const src = e.source as Window | null;
        src?.postMessage(
          { type: "aw-eco-me:pecaFinalizadaAck", ok },
          e.origin
        );
      }

      if (msg.type === "aw-eco-me:cadeiaCompleta") {
        toast.success("Cadeia concluída — todas as peças foram geradas");
        navigate(`/clientes/${msg.payload.cliente}`);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [navigate]);

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
