import { describe, it, expect } from "bun:test";
import { acharProblemas, resumoDoDiagnostico, type EntradaDiagnostico } from "./diagnosticoWa";

const EXIGIDOS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "PRESENCE_UPDATE", "CONNECTION_UPDATE"];

const bom = (over: Partial<EntradaDiagnostico> = {}): EntradaDiagnostico => ({
  instancia: "Portal-Direito-Aberto-2",
  estado: "conectado",
  webhook: {
    configurado: true, ativo: true, url: "https://x.supabase.co/functions/v1/wa-webhook?token=•••",
    apontaPraCa: true, tokenConfere: true, porEvento: false,
    eventos: EXIGIDOS, faltando: [],
  },
  erroWebhook: null,
  recebidos: [{ evento: "connection.update", criado_em: "2026-09-04T22:18:06Z" }],
  conversas: 3,
  exigidos: EXIGIDOS,
  ...over,
});

describe("acharProblemas", () => {
  it("não inventa problema quando está tudo certo", () => {
    const a = acharProblemas(bom());
    expect(a).toHaveLength(1);
    expect(a[0].nivel).toBe("ok");
    expect(a[0].conserto).toContain("URL e token funcionam");
  });

  // O caso real: PDA 2 entregou connection.update e nunca mensagem nenhuma.
  it("aponta MESSAGES_UPSERT desmarcado como a causa da caixa parada", () => {
    const a = acharProblemas(bom({
      webhook: { ...bom().webhook!, eventos: ["CONNECTION_UPDATE"], faltando: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "PRESENCE_UPDATE"] },
    }));
    expect(a[0].nivel).toBe("erro");
    expect(a[0].titulo).toContain("MESSAGES_UPSERT");
    expect(a[0].conserto).toContain("caixa não atualiza");
  });

  it("fala em eventos genéricos quando o que falta não é o da mensagem", () => {
    const a = acharProblemas(bom({
      webhook: { ...bom().webhook!, faltando: ["PRESENCE_UPDATE"] },
    }));
    expect(a[0].titulo).toContain("PRESENCE_UPDATE");
    expect(a[0].titulo).not.toContain("mensagem nova");
  });

  it("põe a instância caída antes de tudo", () => {
    const a = acharProblemas(bom({ estado: "desconectado", webhook: null, erroWebhook: "Evolution 404" }));
    expect(a[0].titulo).toContain("desconectado");
    expect(a[1].conserto).toContain("Evolution 404");
  });

  it("denuncia webhook apontando pra fora", () => {
    const a = acharProblemas(bom({
      webhook: { ...bom().webhook!, apontaPraCa: false, tokenConfere: false, url: "https://n8n.outro/hook" },
    }));
    expect(a[0].titulo).toContain("n8n.outro");
    // Não reclama do token quando a URL inteira já está errada: um problema,
    // uma frase — dois recados sobre a mesma causa viram ruído.
    expect(a.filter((x) => x.titulo.includes("token"))).toHaveLength(0);
  });

  it("denuncia o token errado quando a URL está certa", () => {
    const a = acharProblemas(bom({ webhook: { ...bom().webhook!, tokenConfere: false } }));
    expect(a[0].titulo).toContain("token");
  });

  it("denuncia webhookByEvents, que quebra o token na URL", () => {
    const a = acharProblemas(bom({ webhook: { ...bom().webhook!, porEvento: true } }));
    expect(a[0].titulo).toContain("Webhook by events");
    expect(a[0].conserto).toContain("messages-upsert");
  });

  it("denuncia webhook inexistente", () => {
    const a = acharProblemas(bom({
      webhook: { ...bom().webhook!, configurado: false, url: "" },
    }));
    expect(a[0].titulo).toContain("não tem webhook");
  });

  it("denuncia webhook desligado", () => {
    const a = acharProblemas(bom({ webhook: { ...bom().webhook!, ativo: false } }));
    expect(a[0].titulo).toContain("desligado");
  });

  // A armadilha: `wa_eventos` NÃO guarda mensagem nova, então a ausência dela
  // ali nunca pode virar acusação. Só a caixa vazia levanta a mão, e como
  // alerta, não como erro.
  it("levanta alerta — não erro — quando está tudo certo e a caixa está vazia", () => {
    const a = acharProblemas(bom({ conversas: 0 }));
    expect(a.filter((x) => x.nivel === "erro")).toHaveLength(0);
    expect(a[1].nivel).toBe("alerta");
    expect(a[1].conserto).toContain("entrega");
  });

  it("não fala em entrega comprovada quando nada chegou ainda", () => {
    const a = acharProblemas(bom({ recebidos: [], conversas: 0 }));
    expect(a).toHaveLength(1);
    expect(a[0].conserto).toContain("Ainda não chegou evento nenhum");
  });
});

describe("resumoDoDiagnostico", () => {
  it("conta só os erros", () => {
    expect(resumoDoDiagnostico(acharProblemas(bom()))).toBe("Nada errado na configuração.");
    expect(resumoDoDiagnostico(acharProblemas(bom({ webhook: { ...bom().webhook!, ativo: false } }))))
      .toBe("Achei 1 problema.");
    expect(resumoDoDiagnostico(acharProblemas(bom({
      estado: "desconectado",
      webhook: { ...bom().webhook!, ativo: false, porEvento: true },
    })))).toBe("Achei 3 problemas.");
  });
});
