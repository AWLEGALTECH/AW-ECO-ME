// A PONTE ENTRE O BANCO E A TELA DE ATENDIMENTO.
//
// A tela foi desenhada contra a maquete e ficou boa; não é ela que tem que se
// dobrar ao banco. Este módulo faz o caminho contrário: pega a linha de
// `wa_conversas` / `wa_mensagens` e devolve no MESMO formato que a maquete já
// entregava (Lead, Mensagem). Trocar a fonte passa a ser trocar um array.
//
// O que mora aqui é conversão, e conversão de data e de fuso é onde se erra
// calado: uma hora exibida em UTC parece só "estranha", não parece defeito.
// Por isso o módulo é separado e testado, em vez de virar `.map()` no meio do
// componente.
//
// Enquanto a Evolution não estiver ligada, `wa_conversas` está vazia — a tela
// cai na maquete sozinha e continua servindo pra discutir formato.

export type TipoMsg =
  | "texto" | "audio" | "imagem" | "video" | "documento"
  | "sticker" | "localizacao" | "contato" | "outro";

export interface ConversaRow {
  id: string;
  instancia: string;
  telefone: string;
  jid: string | null;
  nome_wa: string | null;
  foto_url: string | null;
  nao_lidas: number;
  ultima_em: string | null;
  ultima_previa: string | null;
  arquivada: boolean;
  cliente_id: string | null;
  origem: string;
  etapa: string;
  etapas_puladas: string[] | null;
  created_at: string;
}

export interface MensagemRow {
  id: string;
  conversa_id: string;
  direcao: "entrada" | "saida";
  tipo: TipoMsg;
  texto: string | null;
  midia_path: string | null;
  midia_mime: string | null;
  midia_nome: string | null;
  duracao: number | null;
  criada_em: string;
}

/** (92) 98812-4471 a partir de 5592988124471. Fora do formato, devolve como veio. */
export function telefoneBonito(canonico: string): string {
  const d = String(canonico || "").replace(/\D/g, "");
  const s = d.startsWith("55") && d.length === 13 ? d.slice(2) : d;
  if (s.length !== 11) return canonico || "";
  return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
}

/**
 * A hora na lista: hoje mostra a hora, ontem mostra "Ontem", nesta semana
 * mostra o dia, mais velho mostra a data.
 *
 * `agora` entra por parâmetro pra que o teste não dependa do relógio — e é a
 * mesma razão de a comparação ser por DIA DE CALENDÁRIO local e não por
 * diferença de horas: 23h de ontem e 1h de hoje distam 2 horas e são dias
 * diferentes.
 */
export function horaDaLista(iso: string | null, agora = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diasAtras = Math.round((dia(agora) - dia(d)) / 86400000);
  if (diasAtras <= 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diasAtras === 1) return "Ontem";
  if (diasAtras < 7) return d.toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Separador de dia dentro da conversa. Null quando é o mesmo dia da anterior. */
export function separadorDeDia(iso: string, anterior: string | null, agora = new Date()): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (anterior) {
    const a = new Date(anterior);
    if (!Number.isNaN(a.getTime()) &&
        a.getFullYear() === d.getFullYear() && a.getMonth() === d.getMonth() && a.getDate() === d.getDate()) {
      return null;
    }
  }
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diasAtras = Math.round((dia(agora) - dia(d)) / 86400000);
  if (diasAtras <= 0) return "Hoje";
  if (diasAtras === 1) return "Ontem";
  if (diasAtras < 7) {
    const s = d.toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Horas desde a última mensagem DELE sem resposta nossa. 0 quando a bola é dele. */
export function horasSemResposta(msgs: MensagemRow[], agora = new Date()): number {
  const ultima = msgs[msgs.length - 1];
  if (!ultima || ultima.direcao !== "entrada") return 0;
  const t = new Date(ultima.criada_em).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - t) / 3600000));
}

/** O que a lista mostra como prévia quando a conversa ainda não tem prévia gravada. */
export function previaDe(m: MensagemRow | undefined): string {
  if (!m) return "";
  switch (m.tipo) {
    case "audio":       return "🎵 Áudio";
    case "imagem":      return "📷 Imagem";
    case "video":       return "🎬 Vídeo";
    case "documento":   return `📄 ${m.midia_nome ?? "Documento"}`;
    case "sticker":     return "🩶 Figurinha";
    case "localizacao": return "📍 Localização";
    case "contato":     return "👤 Contato";
    default:            return m.texto ?? "";
  }
}

/** Rótulo curto de duração de áudio: 32 → "0:32", 95 → "1:35". */
export function duracaoCurta(seg: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(seg) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Qual conversa está aberta.
 *
 * A tela nasce com o id da MAQUETE selecionado, porque na primeira renderização
 * ninguém sabe ainda se o WhatsApp respondeu. Quando ele responde, esse id não
 * existe entre as conversas reais — e aí a lista mostra a primeira conversa, o
 * cabeçalho mostra o nome dela, e o corpo fica vazio, porque as mensagens
 * estavam sendo buscadas por um id que não é de ninguém. Parece conversa sem
 * mensagem; é conversa nenhuma.
 *
 * Regra: o escolhido vale se ele existe entre as vivas; senão, abre a primeira.
 */
export function idDaConversaAberta(escolhido: string, conversas: { id: string }[]): string {
  if (conversas.length === 0) return escolhido;
  return conversas.some((c) => c.id === escolhido) ? escolhido : conversas[0].id;
}
