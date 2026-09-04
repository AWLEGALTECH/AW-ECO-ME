// diagnosticoWa — traduz a configuração da Evolution em frases acionáveis.
//
// "Conectou, mas não chega mensagem" é o sintoma de pelo menos seis coisas
// diferentes, e todas se parecem na tela: a instância caída, o webhook nunca
// configurado, a URL apontando pra outro projeto, o token errado, o evento
// MESSAGES_UPSERT desmarcado, ou o `webhookByEvents` ligado. Nenhuma delas dá
// pra ver de fora.
//
// EU JÁ ERREI DUAS VEZES DEDUZINDO DE AUSÊNCIA nesta integração — "não tem log,
// logo não chegou" — e as duas vezes a causa era outra. Então este arquivo não
// adivinha: recebe o que a Evolution respondeu quando perguntada e diz, em
// ordem de gravidade, o que está errado E o que fazer. Cada achado tem conserto
// junto, porque diagnóstico sem conserto é só uma forma educada de silêncio.
//
// A REGRA MAIS SUTIL É A DO `wa_eventos`. Aquela tabela guarda tudo MENOS
// mensagem nova (mensagem nova vira conversa, não linha de evento). Então a
// ausência de "messages.upsert" ali não prova nada — mas a presença de qualquer
// outro evento prova muito: prova que a URL e o token estão certos, porque a
// Evolution conseguiu entregar. Confundir as duas leituras foi exatamente o
// erro que motivou escrever isto.

export type Achado = {
  nivel: "erro" | "alerta" | "ok";
  titulo: string;
  conserto: string;
};

export type EntradaDiagnostico = {
  instancia: string;
  estado: string;
  webhook: {
    configurado: boolean; ativo: boolean; url: string;
    apontaPraCa: boolean; tokenConfere: boolean; porEvento: boolean;
    eventos: string[]; faltando: string[];
  } | null;
  erroWebhook: string | null;
  recebidos: { evento: string; criado_em: string }[];
  conversas: number;
  exigidos: string[];
};

export function acharProblemas(d: EntradaDiagnostico): Achado[] {
  const achados: Achado[] = [];

  if (d.estado !== "conectado") {
    achados.push({
      nivel: "erro",
      titulo: `A instância está ${d.estado}.`,
      conserto: "Webhook certo em número caído dá o mesmo sintoma. Leia o QR de novo antes de mexer em qualquer outra coisa.",
    });
  }

  if (!d.webhook) {
    achados.push({
      nivel: "erro",
      titulo: "Não consegui ler a configuração do webhook.",
      conserto: d.erroWebhook
        ? `A Evolution respondeu: ${d.erroWebhook}`
        : "A Evolution não devolveu a configuração desta instância.",
    });
  } else {
    const w = d.webhook;
    if (!w.configurado) {
      achados.push({
        nivel: "erro",
        titulo: "Esta instância não tem webhook nenhum configurado.",
        conserto: "Clique em “Reconfigurar eventos”: ele aponta a URL daqui e marca os eventos que o sistema usa.",
      });
    } else {
      if (!w.ativo) {
        achados.push({
          nivel: "erro",
          titulo: "O webhook existe mas está desligado.",
          conserto: "Clique em “Reconfigurar eventos” — ele reativa junto.",
        });
      }
      if (!w.apontaPraCa) {
        achados.push({
          nivel: "erro",
          titulo: `O webhook aponta pra outro lugar: ${w.url}`,
          conserto: "Enquanto apontar pra fora, nenhuma mensagem chega aqui. “Reconfigurar eventos” corrige a URL.",
        });
      } else if (!w.tokenConfere) {
        achados.push({
          nivel: "erro",
          titulo: "A URL está certa, mas o token nela não é o deste sistema.",
          conserto: "A função recusa a entrega e a Evolution desiste em silêncio. “Reconfigurar eventos” regrava a URL com o token certo.",
        });
      }
      if (w.porEvento) {
        achados.push({
          nivel: "erro",
          titulo: "A opção “Webhook by events” está ligada na Evolution.",
          conserto:
            "Com ela ligada, a Evolution posta em URL/messages-upsert — e como o token vai na URL, ele se quebra no caminho. "
            + "Desligue essa opção no painel da Evolution, ou clique em “Reconfigurar eventos”, que já a desliga.",
        });
      }
      if (w.faltando.length > 0) {
        const faltaMensagem = w.faltando.includes("MESSAGES_UPSERT");
        achados.push({
          nivel: "erro",
          titulo: faltaMensagem
            ? "MESSAGES_UPSERT não está marcado — é o evento da mensagem nova."
            : `Faltam eventos: ${w.faltando.join(", ")}.`,
          conserto: faltaMensagem
            ? "É exatamente por isso que a caixa não atualiza: a Evolution avisa que conectou, mas nunca avisa que chegou mensagem. "
              + "“Reconfigurar eventos” marca todos de uma vez."
            : "“Reconfigurar eventos” marca todos de uma vez.",
        });
      }
    }
  }

  if (achados.length === 0) {
    // Só aqui a leitura do `wa_eventos` entra, e com o cuidado de sempre: a
    // ausência de "messages.upsert" naquela tabela não significa nada, porque
    // mensagem nova nunca é gravada lá.
    const entregou = d.recebidos.length > 0;
    achados.push({
      nivel: "ok",
      titulo: "A configuração está certa.",
      conserto: entregou
        ? `A Evolution já entregou ${d.recebidos.length} evento${d.recebidos.length === 1 ? "" : "s"} aqui, `
          + "então URL e token funcionam. Mande uma mensagem de teste pra este número e ela deve aparecer na caixa."
        : "Ainda não chegou evento nenhum desta instância. Mande uma mensagem de teste pra este número e volte aqui.",
    });
    if (d.conversas === 0 && entregou) {
      achados.push({
        nivel: "alerta",
        titulo: "Configuração certa e mesmo assim a caixa está vazia.",
        conserto:
          "Se depois de uma mensagem de teste ela continuar vazia, o problema não é configuração e sim entrega — "
          + "o próximo passo é olhar o que a Evolution mandou (a tela guarda o corpo cru dos eventos).",
      });
    }
  }

  return achados;
}

/** Uma frase de resumo pro topo, sem repetir a lista inteira. */
export function resumoDoDiagnostico(achados: Achado[]): string {
  const erros = achados.filter((a) => a.nivel === "erro").length;
  if (erros === 0) return "Nada errado na configuração.";
  return erros === 1 ? "Achei 1 problema." : `Achei ${erros} problemas.`;
}
