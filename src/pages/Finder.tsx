import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, MessagesSquare, FileText, AlertTriangle, Check } from "lucide-react";
import { appConfig } from "@/config/app-config";
import { supabase } from "@/integrations/supabase/client";
import { useFinderSession } from "@/hooks/useFinderSession";
import { FinderAnaliseComercial } from "@/components/FinderAnaliseComercial";
import { docsDaUrl, nomeDoDocumento } from "@/lib/finderDaConversa";

// Pagina /finder tem tres modos:
//
// 1. STANDALONE (sem parametro): user clicou em "Finder" no sidebar pra usar a
//    ferramenta livremente. Renderiza o iframe direto, sem session persistente.
//
// 2. CLIENTE-LINKED (com ?cliente=&nome=): user clicou em "Iniciar
//    analise" pra um cliente especifico. Inicia uma sessao persistente
//    no contexto FinderSession e deixa o <PersistentFinderHost />
//    renderizar o iframe (que sobrevive a navegacoes pra ficar rodando
//    em segundo plano com pill no topo).
//
// 3. CONVERSA (com ?conversa=&docs=): veio da jornada do lead no Atendimento.
//    É o standalone com uma entrega antes: os PDFs escolhidos na conversa são
//    baixados do storage e postos na fila do Finder, e a análise comercial que
//    sair daqui nasce ligada àquela conversa (o que move o lead pra Proposta).
//
// Quando ha sessao ativa, esta pagina vira so um placeholder — o iframe
// vem do PersistentFinderHost sobreposto. Quando NAO ha, renderiza o
// iframe local direto.

/* ── A ENTREGA DOS ARQUIVOS ──
   O Finder é servido da MESMA ORIGEM (/finder-app/), então o conteúdo do
   iframe é acessível daqui: dá pra achar o <input type="file"> dele e entregar
   os arquivos como se alguém os tivesse arrastado. É por isso que este caminho
   funciona sem tocar no Finder: ele continua sendo o Finder inteiro, com
   parser, OCR, drill-down e o botão de gerar a análise comercial.

   OS OBJETOS NASCEM NO REALM DO IFRAME (win.File, win.DataTransfer), e não
   neste. Um File criado aqui e atribuído a um input de lá é recusado pelo
   Chrome, e o sintoma seria uma fila vazia sem erro nenhum. */
async function entregarAoFinder(
  iframe: HTMLIFrameElement,
  arquivos: { nome: string; blob: Blob }[],
): Promise<boolean> {
  const win = iframe.contentWindow as (Window & typeof globalThis) | null;
  const doc = iframe.contentDocument;
  if (!win || !doc) return false;
  const input = doc.querySelector<HTMLInputElement>('input[type="file"][accept=".pdf"]');
  if (!input) return false;

  const dt = new win.DataTransfer();
  for (const a of arquivos) {
    dt.items.add(new win.File([await a.blob.arrayBuffer()], a.nome, { type: "application/pdf" }));
  }
  input.files = dt.files;
  // O Finder escuta onChange no input; um change nativo do realm dele é o que
  // o React de lá reconhece.
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
  return true;
}

/* O input só existe depois que o React do Finder pintou a tela de upload. O
   `onLoad` do iframe dispara antes disso, então esperamos ele aparecer em vez
   de tentar uma vez e desistir. */
function esperarOInput(iframe: HTMLIFrameElement, limiteMs = 20_000): Promise<boolean> {
  const achou = () => !!iframe.contentDocument?.querySelector('input[type="file"][accept=".pdf"]');
  if (achou()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const inicio = Date.now();
    const iv = setInterval(() => {
      if (achou()) { clearInterval(iv); resolve(true); return; }
      if (Date.now() - inicio > limiteMs) { clearInterval(iv); resolve(false); }
    }, 250);
  });
}

export default function Finder() {
  const [searchParams] = useSearchParams();
  const cliente = searchParams.get("cliente");
  const nome = searchParams.get("nome");
  // Modo conversa: qual conversa e quais anexos dela vieram junto.
  const conversaId = searchParams.get("conversa");
  const docsPedidos = useMemo(() => docsDaUrl(searchParams.get("docs")), [searchParams]);
  // Modo "refazer análise comercial de um cliente existente": continua
  // standalone (a captura acontece aqui), mas ao salvar vai pra RPC de
  // recálculo em vez do catálogo, e volta pro perfil do cliente.
  const refazerClienteId = searchParams.get("refazerComercial");
  const refazerNome = searchParams.get("refazerNome");
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [entrega, setEntrega] = useState<{ estado: "parado" | "baixando" | "entregue" | "erro"; quantos: number; motivo?: string }>(
    { estado: "parado", quantos: 0 });
  const { active, iniciar } = useFinderSession();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    document.title = nome
      ? `Finder · ${nome} · ${appConfig.name}`
      : `Finder · ${appConfig.name}`;
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

  /* ── MODO CONVERSA: baixa os anexos escolhidos e põe na fila do Finder ──
     Os ids vêm da URL e as linhas são lidas aqui, pela RLS do atendimento:
     caminho de storage na barra de endereços seria um jeito de pedir arquivo
     de outra conversa. Os arquivos entram na FILA, e quem clica em "Analisar"
     continua sendo a pessoa: ela pode conferir a lista, tirar um, somar outro
     do computador. */
  const entregar = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe || !conversaId || docsPedidos.length === 0) return;
    setEntrega({ estado: "baixando", quantos: 0 });
    try {
      const { data, error } = await supabase
        .from("wa_mensagens" as never)
        .select("id, midia_path, midia_nome")
        .in("id", docsPedidos as never);
      if (error) throw new Error(error.message);

      const linhas = (data ?? []) as unknown as { id: string; midia_path: string | null; midia_nome: string | null }[];
      // Na ordem em que foram escolhidos, e não na que o banco devolveu.
      const ordenadas = docsPedidos
        .map((id) => linhas.find((l) => l.id === id))
        .filter((l): l is NonNullable<typeof l> => !!l?.midia_path);

      const arquivos: { nome: string; blob: Blob }[] = [];
      for (const l of ordenadas) {
        const { data: blob, error: eDown } = await supabase.storage.from("wa-midia").download(l.midia_path!);
        if (eDown || !blob) continue;
        arquivos.push({ nome: nomeDoDocumento(l.midia_nome, arquivos.length + 1), blob });
      }
      if (arquivos.length === 0) throw new Error("nenhum anexo pôde ser baixado");

      const pronto = await esperarOInput(iframe);
      if (!pronto) throw new Error("o Finder não abriu a tela de upload a tempo");
      const ok = await entregarAoFinder(iframe, arquivos);
      if (!ok) throw new Error("não consegui entregar os arquivos ao Finder");
      setEntrega({ estado: "entregue", quantos: arquivos.length });
    } catch (e) {
      setEntrega({ estado: "erro", quantos: 0, motivo: (e as Error).message });
    }
  }, [conversaId, docsPedidos]);

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
  // O modo conversa nao entra nessa: ele traz os proprios arquivos e roda no
  // iframe local, entao uma sessao de cliente que tenha sobrado na aba nao
  // pode sequestrar a tela.
  if (active && !conversaId) {
    return <div className="h-full w-full -m-3 sm:-m-6" />;
  }

  // Modo standalone: usa o iframe local. Eh o caminho que a Adria pega
  // quando clica em "Finder" no sidebar.
  return (
    <div className="h-full w-full flex flex-col -m-3 sm:-m-6 relative">
      {/* ── DE ONDE VIERAM OS DOCUMENTOS ──
          Uma faixa fina, e não um cartão: o Finder precisa da tela inteira. Ela
          responde a única pergunta que a tela não responde sozinha (estes PDFs
          são de quem?) e mostra a entrega acontecendo. */}
      {conversaId && (
        <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border/60 bg-card/40 backdrop-blur text-xs">
          <MessagesSquare className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">
            Documentos da conversa {nome ? <>com <strong className="text-foreground">{nome}</strong></> : "do Atendimento"}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            {entrega.estado === "baixando" && (
              <><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> <span className="text-muted-foreground">baixando os anexos…</span></>
            )}
            {entrega.estado === "entregue" && (
              <><Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-muted-foreground">
                  {entrega.quantos === 1 ? "1 documento na fila" : `${entrega.quantos} documentos na fila`}. É só clicar em Analisar.
                </span></>
            )}
            {entrega.estado === "erro" && (
              <><AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-muted-foreground">{entrega.motivo}. Arraste os PDFs à mão.</span>
                <button onClick={() => void entregar()} className="text-primary hover:underline">tentar de novo</button></>
            )}
            {entrega.estado === "parado" && docsPedidos.length > 0 && (
              <><FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {docsPedidos.length === 1 ? "1 documento" : `${docsPedidos.length} documentos`} a caminho
                </span></>
            )}
          </span>
        </div>
      )}

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
        onLoad={() => { setCarregando(false); void entregar(); }}
        className="flex-1 w-full border-0"
        allow="clipboard-read; clipboard-write; downloads"
      />
      {/* Ponte comercial — SÓ no modo standalone (fora da esteira): captura a
          análise do Finder e deixa salvar a pré-análise (rubricas não ajuizáveis).
          No modo cliente-linked (esteira) o iframe vem do PersistentFinderHost e
          este componente nem é montado.
          Vindo de uma conversa, a análise nasce ligada a ela: é isso que move o
          lead de "Aguardando análise" para "Proposta", e é aqui que o nome de
          verdade dele (lido do extrato) entra no sistema. */}
      <FinderAnaliseComercial
        iframeRef={iframeRef}
        refazerClienteId={refazerClienteId}
        refazerNome={refazerNome}
        conversaId={conversaId}
      />
    </div>
  );
}
