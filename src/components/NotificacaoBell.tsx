import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, BellOff, Smartphone, UserPlus, UserCheck, Send, PartyPopper, Sunrise, CheckCheck, BarChart3, type LucideIcon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useNotificacoes, type Notificacao } from "@/hooks/useNotificacoes";
import { usePush } from "@/hooks/usePush";

// Ícone + tom por tipo de evento.
const VISUAL: Record<string, { icon: LucideIcon; chip: string }> = {
  pre_cliente_criado:     { icon: UserPlus,  chip: "bg-primary/12 ring-primary/25 text-primary" },
  pre_cliente_confirmado: { icon: UserCheck, chip: "bg-emerald-500/12 ring-emerald-500/25 text-emerald-400" },
  peca_protocolada:       { icon: Send,        chip: "bg-amber-400/12 ring-amber-400/30 text-amber-400" },
  cliente_assinou:        { icon: PartyPopper, chip: "bg-emerald-500/12 ring-emerald-500/25 text-emerald-400" },
  bom_dia:                { icon: Sunrise,     chip: "bg-amber-400/12 ring-amber-400/30 text-amber-400" },
  balanco_comercial:      { icon: BarChart3,   chip: "bg-primary/12 ring-primary/25 text-primary" },
};

// Nome em Title Case (tira o CAIXA ALTA do cadastro).
function capNome(s?: string | null): string {
  if (!s) return "";
  const small = new Set(["de", "da", "do", "das", "dos", "e"]);
  return s.trim().toLowerCase().split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
function primeiroNome(s?: string | null): string {
  return capNome((s || "").trim().split(/\s+/)[0] || "");
}
function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Corpo do sininho, montado a partir dos dados — permite negrito no nome do
// cliente e no valor (o que o push, texto puro do SO, não permite).
function CorpoRico({ n }: { n: Notificacao }) {
  const d = n.dados || {};
  const B = (t: string) => <strong className="font-semibold text-foreground/90">{t}</strong>;

  if (n.tipo === "bom_dia") {
    const v = Number(d.valor_total) || 0;
    return <>Bom dia, nosso valor total em processos ajuizados é de {B(fmtBRL(v))}.</>;
  }

  if (n.tipo === "balanco_comercial") {
    const ticket = Number(d.ticket_medio) || 0;
    const nCli = Number(d.n_clientes) || 0;
    const nAcoes = Number(d.n_acoes) || 0;
    return (
      <span className="flex flex-col gap-0.5">
        <span>Ticket médio dos processos: {B(fmtBRL(ticket))}</span>
        <span>Clientes: {B(String(nCli))}</span>
        <span>Ações ajuizadas: {B(String(nAcoes))}</span>
      </span>
    );
  }

  const nome = capNome(d.cliente_nome);
  if (!nome) return <>{n.corpo}</>;
  const autor = primeiroNome(n.actor_nome);

  if (n.tipo === "pre_cliente_criado") {
    return autor
      ? <>{autor} cadastrou o pré-cliente {B(nome)}, que agora aguarda confirmação.</>
      : <>{B(nome)} foi cadastrado como pré-cliente e aguarda confirmação.</>;
  }
  if (n.tipo === "pre_cliente_confirmado") {
    return <>{B(nome)} virou cliente.{autor ? <> Fechamento de {autor}.</> : null}</>;
  }
  if (n.tipo === "peca_protocolada") {
    const v = Number(d.valor_causa) || 0;
    return <>A ação de {B(nome)} foi protocolada, com valor de causa de {B(fmtBRL(v))}.</>;
  }
  if (n.tipo === "cliente_assinou") {
    return <>{B(nome)} assinou o contrato.</>;
  }
  return <>{n.corpo}</>;
}

function tempoAtras(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function NotificacaoBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { notificacoes, unread, isLoading, marcarUma, marcarTodas } = useNotificacoes();
  const push = usePush();

  const abrir = (n: Notificacao) => {
    marcarUma(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative h-11 w-11 md:h-9 md:w-9 inline-flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          aria-label="Notificações"
        >
          <Bell className="h-6 w-6 md:h-[18px] md:w-[18px]" />
          {unread > 0 && (
            <span className="absolute top-0.5 right-0.5 md:-top-0.5 md:-right-0.5 min-w-[20px] h-[20px] md:min-w-[18px] md:h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] md:text-[10px] font-bold tabular-nums ring-2 ring-background">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[360px] max-w-[92vw] p-0 rounded-2xl border border-white/[0.08] bg-card/95 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Notificações</span>
            {unread > 0 && (
              <span className="text-[10px] text-muted-foreground">({unread} nova{unread > 1 ? "s" : ""})</span>
            )}
          </div>
          {unread > 0 && (
            <button
              onClick={() => marcarTodas()}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
            </button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <p className="text-center text-xs text-muted-foreground py-10">Carregando…</p>
          ) : notificacoes.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Nenhuma notificação por aqui.</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {notificacoes.map((n) => {
                const v = VISUAL[n.tipo] || { icon: Bell, chip: "bg-white/[0.06] ring-white/10 text-muted-foreground" };
                const Icon = v.icon;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => abrir(n)}
                      className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] ${
                        n.lida ? "opacity-70" : "bg-primary/[0.04]"
                      }`}
                    >
                      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ring-1 ${v.chip}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-semibold text-foreground truncate flex-1">{n.titulo}</p>
                          {!n.lida && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                        </div>
                        <p className="text-[12px] text-muted-foreground line-clamp-2 mt-0.5">
                          <CorpoRico n={n} />
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">{tempoAtras(n.created_at)}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Rodapé: push por aparelho (com o app fechado) */}
        <div className="border-t border-white/[0.07] px-4 py-3">
          {!push.supported ? (
            <div className="flex items-start gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-snug">
                Pra receber com o app fechado no iPhone, abra pelo ícone na{" "}
                <strong className="text-foreground/80">tela inicial</strong> (não pelo Safari).
              </p>
            </div>
          ) : push.subscribed ? (
            <button
              onClick={() => push.desativar()}
              disabled={push.busy}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors disabled:opacity-50"
            >
              <BellRing className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="flex-1 text-left">Push ativo neste aparelho</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <BellOff className="h-3.5 w-3.5" /> Desativar
              </span>
            </button>
          ) : (
            <button
              onClick={() => push.ativar()}
              disabled={push.busy}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium bg-primary/12 text-primary ring-1 ring-primary/25 hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <BellRing className="h-4 w-4 shrink-0" />
              {push.busy ? "Ativando…" : "Ativar notificações neste aparelho"}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
