// ler-documentos — o que está escrito nos papéis que o lead mandou.
//
// O último passo comercial é alguém digitar no Writer o que já está escrito no
// RG, no CPF e na conta de luz que o lead mandou no WhatsApp. São nove campos,
// quase todos números, copiados à mão de uma foto tirada de lado.
//
// Não dá para fazer isso com parser: medimos os arquivos e todo PDF que chega
// do cliente é FOTO DENTRO DE PDF (zero operadores de texto, duas imagens por
// página, a assinatura de aplicativo de scanner de celular). Quem lê é um
// modelo de visão.
//
// ───────────────────────────── o que esta função faz ────────────────────────
//
//   POST { conversa_id, paths?, refazer?, lote? }  ->  { leituras, restam }
//
// Baixa cada anexo, manda ao Claude UM DE CADA VEZ e guarda o cru em
// `wa_leitura_documentos`. Devolve o que leu, sem julgar nada.
//
// UM DE CADA VEZ, e não os nove juntos, por dois motivos que valem o custo:
//   1. saber DE QUAL documento saiu cada campo (a tela mostra, a pessoa confere)
//   2. quando dois documentos discordam, ver a discordância em vez de receber
//      uma média inventada
//
// E POUCOS POR CHAMADA. A primeira versão lia os doze anexos de uma vez e morria
// com WORKER_RESOURCE_LIMIT: para mandar ao modelo o arquivo vira base64, que é
// um terço maior, e doze scans de celular na mesma função estouram a memória do
// worker. Cada chamada lê `lote` (quatro) e devolve quantos `restam`; a tela
// chama de novo até zerar, e de quebra ganha barra de progresso.
//
// ──────────────────────── por que Claude e não Gemini ───────────────────────
//
// O Gemini estava no free tier, com teto de VINTE LEITURAS POR DIA. Um único
// lead com doze anexos consumia mais da metade da cota diária, e o teste do
// segundo lead do dia já batia em 429. Não era preço, era teto.
//
// Medido o custo do Claude para este trabalho: a foto custa cerca de 1.500
// tokens (o modelo limita a imagem a ~1,15 megapixel), o prompt uns 500, e a
// resposta uns 100. Dá algo perto de sete centavos por documento no Opus 5,
// menos de um real no lead inteiro. O Opus é o mais caro dos três e é o
// escolhido de propósito: a diferença para o modelo mais barato é de cinco
// centavos por documento, e o que está em jogo é transcrever dígito de CPF e
// número de RG de uma foto torta. A conferência do outro lado pega CPF com
// dígito errado, mas NÃO pega RG errado, endereço errado nem nome da mãe no
// lugar do titular. Economizar num campo que vai para a procuração é economia
// ruim.
//
// QUEM JULGA NÃO É ESTA FUNÇÃO. O que volta daqui é o que o modelo disse, e o
// modelo erra. A conferência (dígito do CPF, data que existe, nome cruzado)
// mora em `src/lib/leituraDeDocumentos.ts`, testada, do lado de cá da tela.
// Guardar o cru é de propósito: a regra de conferência muda com o tempo e a
// leitura, não.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Anthropic from "npm:@anthropic-ai/sdk";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { z } from "npm:zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const MODELO = "claude-opus-5";

/* O que o modelo enxerga. HEIC do iPhone não entra nesta lista: o WhatsApp
   quase sempre converte para JPEG antes de enviar, e quando não converte é
   melhor dizer isso na tela do que mandar bytes que voltam em erro. */
const IMAGENS_OK: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

/* Dez megas já é foto de documento muito acima do normal (as desta base têm
   entre 17 KB e 2 MB), e o base64 de um arquivo maior que isso é o que derruba
   o worker. */
const LIMITE_BYTES = 10 * 1024 * 1024;
/* Quantos por chamada. Quatro cabem na memória com folga. */
const LOTE_PADRAO = 4;

/* O prompt. Cada frase aqui existe por causa de um jeito conhecido de errar.

   "NÃO DEDUZA" porque modelo preenche para não devolver vazio, e campo
   inventado é o pior resultado possível: parece certo e ninguém confere. Medido
   numa carteira de identidade desta base: sem esquema e sem esta regra, o
   modelo devolveu como "orgao_expedidor" o nome do diretor impresso no rodapé.

   "FILIAÇÃO NÃO É O TITULAR" porque no RG o nome do pai e da mãe vem logo
   abaixo do nome da pessoa, em rótulo parecido, e é o erro clássico da leitura
   de RG.

   "DÍGITO POR DÍGITO" porque o CPF vai ser conferido pelo dígito verificador do
   lado de cá: se o modelo "arredondar" um número mal impresso, a conta não
   fecha e o achado é descartado em vez de entrar errado na procuração. */
const PROMPT = `Você está lendo UM documento de identificação ou comprovante brasileiro para preencher uma qualificação jurídica.

Extraia SOMENTE o que está VISIVELMENTE ESCRITO neste documento.

REGRAS, nesta ordem de importância:
1. NÃO DEDUZA, NÃO COMPLETE, NÃO ADIVINHE. Campo que não aparece no documento volta como string vazia "". Vazio é uma resposta correta; inventado é um erro que ninguém vai perceber.
2. Números (CPF, RG, CEP, datas) se transcrevem DÍGITO POR DÍGITO, exatamente como estão impressos. Se um dígito estiver ilegível ou cortado, devolva o campo inteiro vazio.
3. FILIAÇÃO NÃO É O TITULAR. Em RG e CNH o nome do pai e da mãe aparecem logo abaixo do nome da pessoa. O campo "nome" é o do TITULAR do documento.
4. Em comprovante de residência (conta de luz, água, telefone), o endereço é o do CLIENTE, nunca o da concessionária. O nome é o do titular da conta.
5. "orgao_expedidor" é a SIGLA com a UF, como SSP/AM ou DETRAN/AM. Nome de pessoa impresso no documento (diretor, chefe do instituto) NÃO é órgão expedidor.
6. "estado_civil" só se estiver escrito no documento. Certidão de casamento e RG às vezes trazem; conta de luz nunca traz.
7. "nascimento" no formato DD/MM/AAAA.
8. "endereco" é a linha completa: logradouro, número, complemento e bairro. O CEP vai separado, no campo "cep".
9. "tipo" é o que este documento é, em duas ou três palavras: "RG", "CPF", "CNH", "comprovante de residência", "certidão de casamento", "contracheque", "extrato bancário", "outro".`;

/* O formato da resposta. Com `output_config.format` o modelo não tem como
   devolver outra coisa: some a etapa de caçar JSON dentro de crase, que era
   metade dos erros da versão anterior. */
const Ficha = z.object({
  tipo: z.string(),
  nome: z.string(),
  cpf: z.string(),
  rg: z.string(),
  orgao_expedidor: z.string(),
  nascimento: z.string(),
  cep: z.string(),
  endereco: z.string(),
  profissao: z.string(),
  estado_civil: z.string(),
});
type FichaLida = z.infer<typeof Ficha>;

const CAMPOS = [
  "nome", "cpf", "rg", "orgao_expedidor", "nascimento",
  "cep", "endereco", "profissao", "estado_civil",
] as const;

/* Sem `Array.from`: ele faz uma cópia do pedaço em array comum (oito bytes por
   número, em vez de um), e era parte do que estourava a memória do worker. */
function paraBase64(bytes: Uint8Array): string {
  let s = "";
  const pedaco = 0x2000;
  for (let i = 0; i < bytes.length; i += pedaco) {
    s += String.fromCharCode(...bytes.subarray(i, i + pedaco));
  }
  return btoa(s);
}

/** O bloco que vai junto do prompt: documento para PDF, imagem para foto. */
function anexoParaBloco(bytes: Uint8Array, mime: string) {
  const dados = paraBase64(bytes);
  if (mime.includes("pdf")) {
    // O Claude lê PDF nativamente, então scan e foto seguem pelo mesmo caminho.
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: "application/pdf" as const, data: dados },
    };
  }
  const media = IMAGENS_OK[mime];
  if (!media) return null;
  return { type: "image" as const, source: { type: "base64" as const, media_type: media, data: dados } };
}

/**
 * Uma leitura.
 *
 * O SDK já tenta de novo sozinho em 429 e 5xx (`maxRetries`), então aqui não
 * existe mais a escada de esperas que a versão do Gemini carregava: ela só
 * duplicava o que a biblioteca faz melhor, e foi o que fez uma tela parecer
 * travada por oitenta e cinco segundos.
 */
async function lerComClaude(
  claude: Anthropic, bytes: Uint8Array, mime: string,
): Promise<{ campos: Record<string, string>; tipo: string } | { erro: string }> {
  if (bytes.length > LIMITE_BYTES) {
    return { erro: `arquivo grande demais (${Math.round(bytes.length / 1e6)} MB)` };
  }
  const bloco = anexoParaBloco(bytes, mime);
  if (!bloco) return { erro: `não sei ler ${mime}` };

  try {
    const resposta = await claude.messages.parse({
      model: MODELO,
      /* Folga, não desperdício: só se paga o que for gerado. A resposta tem
         cem tokens, mas o raciocínio adaptativo entra no mesmo teto, e teto
         curto trunca no meio e obriga a refazer. */
      max_tokens: 8192,
      output_config: {
        /* Esforço baixo de propósito. Copiar um CPF de uma imagem é leitura,
           não raciocínio, e quem decide o que vale é a conferência do outro
           lado. Baixar o esforço é melhor que desligar o raciocínio: desligado,
           o Opus 5 às vezes escreve a resposta no texto visível em vez do
           formato pedido. */
        effort: "low",
        format: zodOutputFormat(Ficha),
      },
      // O anexo vem ANTES do texto: é a ordem que o modelo lê melhor.
      messages: [{ role: "user", content: [bloco, { type: "text", text: PROMPT }] }],
    });

    const ficha = resposta.parsed_output as FichaLida | null;
    if (!ficha) return { erro: `o modelo não devolveu a ficha (${resposta.stop_reason ?? "sem motivo"})` };

    const campos: Record<string, string> = {};
    for (const c of CAMPOS) campos[c] = String(ficha[c] ?? "").trim();
    return { campos, tipo: String(ficha.tipo ?? "").trim() };
  } catch (e) {
    /* Classes tipadas em vez de comparar texto de erro: a diferença entre
       "acabou a cota" e "a chave está errada" muda o que a tela diz. */
    if (e instanceof Anthropic.AuthenticationError) return { erro: "a ANTHROPIC_API_KEY não foi aceita" };
    if (e instanceof Anthropic.RateLimitError) return { erro: "limite de chamadas atingido, tente em instantes" };
    if (e instanceof Anthropic.APIError) return { erro: `claude ${e.status}: ${String(e.message).slice(0, 160)}` };
    return { erro: String((e as Error)?.message || e).slice(0, 200) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const { conversa_id, paths, refazer = false, limite = 30, lote = LOTE_PADRAO } =
      await req.json().catch(() => ({}));
    if (!conversa_id) return j({ error: "conversa_id e obrigatorio" }, 400);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return j({ error: "ANTHROPIC_API_KEY nao configurada" }, 500);

    /* Um minuto por documento é muito mais que os poucos segundos que uma
       leitura leva, e o suficiente para o SDK tentar de novo sem que o lote de
       quatro estoure o relógio da função. */
    const claude = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } });

    /* O que se lê: o que o LEAD mandou. Documento que nós enviamos (contrato,
       procuração) não traz dado dele que já não saibamos. */
    let q = sb.from("wa_mensagens")
      .select("id, criada_em, tipo, midia_mime, midia_path, midia_nome")
      .eq("conversa_id", conversa_id)
      .eq("direcao", "entrada")
      .not("midia_path", "is", null)
      .in("tipo", ["documento", "imagem"])
      .order("criada_em")
      .limit(limite);
    if (Array.isArray(paths) && paths.length) q = q.in("midia_path", paths);

    const { data: msgs, error } = await q;
    if (error) return j({ error: error.message }, 500);
    const anexos = (msgs ?? []) as Record<string, string>[];
    if (!anexos.length) {
      return j({ conversa_id, leituras: [], restam: 0, recado: "nenhum documento do lead nesta conversa" });
    }

    /* O que já foi lido não se lê de novo: o documento não muda, e cada leitura
       custa. `refazer` existe para quando o prompt melhorar. */
    const guardadas = new Map<string, Record<string, unknown>>();
    if (!refazer) {
      const { data: antigas } = await sb.from("wa_leitura_documentos")
        .select("midia_path, documento, tipo, campos, erro")
        .eq("conversa_id", conversa_id);
      // Leitura que deu erro não conta como lida: tentar de novo é o certo.
      for (const a of (antigas ?? []) as Record<string, unknown>[]) {
        if (!a.erro) guardadas.set(String(a.midia_path), a);
      }
    }

    const leituras: unknown[] = [];
    const novas: Record<string, unknown>[] = [];
    /* O orçamento desta chamada. Chegando a zero, o que sobrou volta como
       `restam` e a tela pede o próximo lote. */
    let orcamento = Math.max(1, Math.min(8, Number(lote) || LOTE_PADRAO));
    let restam = 0;

    for (const m of anexos) {
      const path = m.midia_path;
      const nome = m.midia_nome || path.split("/").pop() || path;

      const guardada = guardadas.get(path);
      if (guardada) {
        leituras.push({
          path, documento: guardada.documento ?? nome,
          tipo: guardada.tipo, campos: guardada.campos, de_antes: true,
        });
        continue;
      }

      if (orcamento <= 0) { restam++; continue; }
      orcamento--;

      const { data: blob, error: eDl } = await sb.storage.from("wa-midia").download(path);
      if (eDl || !blob) {
        leituras.push({ path, documento: nome, erro: eDl?.message ?? "não baixou o arquivo" });
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mime = (m.midia_mime || blob.type || "").toLowerCase().split(";")[0].trim();

      /* O tempo de cada leitura volta na resposta de propósito: quando isto
         estourar o relógio, o número diz qual documento segurou, em vez de
         deixar adivinhar. */
      const t0 = Date.now();
      const r = await lerComClaude(claude, bytes, mime);
      const ms = Date.now() - t0;

      if ("erro" in r) {
        leituras.push({ path, documento: nome, erro: r.erro, ms });
        novas.push({ conversa_id, midia_path: path, documento: nome, campos: {}, erro: r.erro, modelo: MODELO });
        continue;
      }
      leituras.push({ path, documento: nome, tipo: r.tipo, campos: r.campos, ms });
      novas.push({ conversa_id, midia_path: path, documento: nome, tipo: r.tipo, campos: r.campos, modelo: MODELO });
    }

    if (novas.length) {
      const { error: eUp } = await sb.from("wa_leitura_documentos")
        .upsert(novas, { onConflict: "midia_path" });
      if (eUp) console.warn("[ler-documentos] nao guardou:", eUp.message);
    }

    return j({ conversa_id, anexos: anexos.length, lidas_agora: novas.length, restam, leituras });
  } catch (e) {
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
