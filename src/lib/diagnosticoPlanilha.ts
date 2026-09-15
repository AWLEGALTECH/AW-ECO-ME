/* POR QUE A PLANILHA NÃO ABRIU, E O QUE FAZER A RESPEITO.
 *
 * Ligar uma planilha falha quase sempre pelo mesmo motivo: ela não está
 * compartilhada com a conta de serviço do sistema. E o erro que o Google devolve
 * para esse caso é ilegível de propósito, porque ele não quer contar quem tem
 * acesso ao quê:
 *
 *   A conta de serviço não consegue abrir a planilha. Compartilhe com
 *   aw-eco-drive@aw-eco-drive-497216.iam.gserviceaccount.com (leitor). ·
 *   Sheets 403: The caller does not have permission · Drive 404: File not
 *   found: 1GzHfefANFBjCpXWN1UwgWqI-58QYd48oliuyxn82WjE
 *
 * Quem lê isso e não construiu o sistema não sabe o que fazer.
 *
 * E o 404 é uma armadilha nos DOIS sentidos. O Google responde "not found"
 * tanto para arquivo que não existe quanto para arquivo que existe e que a
 * conta não pode ver: ler isso como link errado manda conferir o que está
 * certo, e ler como permissão manda mexer numa planilha que nem é a certa.
 * Quando não há pista melhor, esta tradução oferece as duas saídas em vez de
 * escolher uma e acertar metade das vezes.
 *
 * Este módulo traduz. Cada problema vira um título curto, uma lista de passos
 * na ordem em que se faz, e o que precisa ser copiado. A frase crua do Google
 * continua disponível embaixo, para o caso raro em que nada disso baste.
 */

export type TipoDeProblema =
  | "ok"
  | "sem_permissao"
  | "nao_encontrada"
  | "api_desligada"
  | "vazia"
  | "outro";

export interface DiagnosticoDaPlanilha {
  tipo: TipoDeProblema;
  /** não adianta ligar uma base que não se consegue ler: o problema vem junto */
  impede: boolean;
  titulo: string;
  /** o que fazer, na ordem em que se faz */
  passos: string[];
  /** o que precisa ir para a área de transferência (o e-mail da conta de serviço) */
  copiar: string | null;
  /** a frase crua do Google, para quando os passos não bastarem */
  detalhe: string | null;
}

/** A resposta da edge function `leads-planilha`, no que interessa aqui. */
export interface RespostaDaLeitura {
  ok?: boolean;
  error?: string | null;
  /** o e-mail da conta de serviço; a função devolve em todos os caminhos */
  conta?: string | null;
  aviso?: string | null;
  cabecalho?: string[];
  linhas?: unknown[];
  csv?: string | null;
  aba?: string | null;
}

/** O e-mail da conta de serviço, de onde ele estiver. */
export function contaDeServico(r: RespostaDaLeitura): string | null {
  const direto = (r.conta || "").trim();
  if (direto.includes("@")) return direto;
  /* Quando a função não devolveu o campo (versão antiga, erro cedo demais), ele
     costuma estar dentro da própria frase do Google. Vale a pena pescar: é o
     único dado que a pessoa precisa copiar. */
  const m = String(r.error || "").match(/[a-z0-9._%-]+@[a-z0-9.-]+\.iam\.gserviceaccount\.com/i);
  return m ? m[0] : null;
}

const PASSOS_DE_COMPARTILHAR = [
  "Abra a planilha no Google Sheets.",
  "Clique em Compartilhar, no canto superior direito.",
  "Cole o e-mail abaixo no campo de pessoas.",
  "Escolha o acesso de Leitor e clique em Enviar.",
  "Volte aqui e toque em Testar de novo.",
];

/**
 * O que houve, em prosa, com o que fazer.
 *
 * `impede` separa o que trava de ligar do que é só um aviso. Planilha vazia
 * não trava: a pessoa pode estar ligando a base antes de a landing receber o
 * primeiro lead, e recusar isso seria inventar um problema.
 */
export function diagnosticarPlanilha(r: RespostaDaLeitura): DiagnosticoDaPlanilha {
  const erro = String(r.error || "");
  const conta = contaDeServico(r);
  const bruto = erro.trim() || null;

  if (r.ok === false || erro) {
    /* PERMISSÃO SE RECONHECE PELA PISTA EXPLÍCITA, e não por 404.
       A leitura já junta "Compartilhe com <conta>" sempre que o Drive recusa
       (403 ou 404), então essa frase é o sinal confiável. Tratar QUALQUER 404
       como permissão seria o engano oposto ao antigo: o Sheets também devolve
       404 para link errado de verdade, e aí a receita de compartilhar faz a
       pessoa mexer na planilha errada. O caso ambíguo é resolvido embaixo, em
       "não encontrada", que oferece as duas saídas. */
    const pareceCompartilhamento =
      /compartilhe com/i.test(erro)
      || /does not have permission|permissionDenied|\b403\b/i.test(erro);

    if (/desligada|SERVICE_DISABLED|has not been used in project/i.test(erro) && !pareceCompartilhamento) {
      return {
        tipo: "api_desligada",
        impede: true,
        titulo: "A API do Google Sheets está desligada no projeto",
        passos: [
          "Isto se resolve no Google Cloud, e não na planilha.",
          "Peça a quem cuida do projeto para habilitar a API do Google Sheets.",
          "Enquanto isso, a leitura tenta um caminho alternativo que só lê a primeira aba.",
        ],
        copiar: null,
        detalhe: bruto,
      };
    }

    if (pareceCompartilhamento) {
      return {
        tipo: "sem_permissao",
        impede: true,
        titulo: "A planilha não está compartilhada com o sistema",
        passos: PASSOS_DE_COMPARTILHAR,
        copiar: conta,
        detalhe: bruto,
      };
    }

    if (/não encontrada|nao encontrada|not found|404/i.test(erro)) {
      /* DUAS CAUSAS, INDISTINGUÍVEIS DAQUI. O Google responde a mesma coisa
         para "esse arquivo não existe" e para "existe e você não pode vê-lo".
         Escolher uma das duas na cara da pessoa seria adivinhar; as duas
         saídas cabem na mesma lista, e a primeira é a mais barata de tentar. */
      return {
        tipo: "nao_encontrada",
        impede: true,
        titulo: "Não consegui abrir essa planilha",
        passos: conta
          ? [
              "Confira o link: copie da barra de endereço com a planilha aberta.",
              "Se o link estiver certo, ela existe e não está compartilhada.",
              "Nesse caso, clique em Compartilhar e cole o e-mail abaixo como Leitor.",
              "Volte aqui e toque em Testar de novo.",
            ]
          : [
              "Confira se o link é de uma planilha do Google Sheets.",
              "Copie o link da barra de endereço com a planilha aberta.",
            ],
        copiar: conta,
        detalhe: bruto,
      };
    }

    return {
      tipo: "outro",
      impede: true,
      titulo: "Não consegui ler a planilha",
      passos: conta
        ? ["Confira se ela está compartilhada com o e-mail abaixo, como Leitor.", "Depois toque em Testar de novo."]
        : ["Confira o link e tente de novo."],
      copiar: conta,
      detalhe: bruto,
    };
  }

  /* Leu, mas não há o que ler. Não impede: quem liga a base antes do primeiro
     lead está fazendo a coisa certa, e recusar seria inventar um problema. */
  const temLinha = (r.linhas?.length ?? 0) > 0 || !!(r.csv || "").trim();
  if (!temLinha) {
    return {
      tipo: "vazia",
      impede: false,
      titulo: "A planilha abriu, mas está sem linhas",
      passos: [
        r.aba
          ? `Li a aba "${r.aba}". Se os leads estão em outra, escreva o nome dela no campo Aba.`
          : "Se os leads estão em outra aba, escreva o nome dela no campo Aba.",
        "Dá para ligar assim mesmo: assim que a landing gravar a primeira linha, ela aparece aqui.",
      ],
      copiar: null,
      detalhe: r.aviso ? String(r.aviso) : null,
    };
  }

  return {
    tipo: "ok",
    impede: false,
    titulo: "Planilha lida",
    passos: [],
    copiar: null,
    detalhe: r.aviso ? String(r.aviso) : null,
  };
}

/** Quantas linhas de dados a leitura trouxe, para o aviso de sucesso. */
export function linhasLidas(r: RespostaDaLeitura): number {
  if (r.linhas?.length) return r.linhas.length;
  const csv = String(r.csv || "").trim();
  if (!csv) return 0;
  // menos o cabeçalho; nunca negativo
  return Math.max(0, csv.split("\n").filter((l) => l.trim()).length - 1);
}
