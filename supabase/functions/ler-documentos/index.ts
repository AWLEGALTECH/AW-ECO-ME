// ler-documentos — o que está escrito nos papéis que o lead mandou.
//
// O último passo comercial é alguém digitar no Writer o que já está escrito no
// RG, no CPF e na conta de luz que o lead mandou no WhatsApp. São nove campos,
// quase todos números, copiados à mão de uma foto tirada de lado.
//
// Não dá para fazer isso com parser: medimos os arquivos desta conversa e todos
// são FOTO DENTRO DE PDF (zero operadores de texto, duas imagens por página, a
// assinatura de aplicativo de scanner de celular). Quem lê é um modelo de
// visão.
//
// ───────────────────────────── o que esta função faz ────────────────────────
//
//   POST { conversa_id, paths?, refazer?, lote? }  ->  { leituras, restam }
//
// Baixa cada anexo, manda para o Gemini UM DE CADA VEZ e guarda o cru em
// `wa_leitura_documentos`. Devolve o que leu, sem julgar nada.
//
// UM DE CADA VEZ, e não os nove juntos, por dois motivos que valem o custo:
//   1. saber DE QUAL documento saiu cada campo (a tela mostra, a pessoa confere)
//   2. quando dois documentos discordam, ver a discordância em vez de receber
//      uma média inventada
//
// E POUCOS POR CHAMADA. A primeira versão lia os doze anexos desta conversa de
// uma vez e morria com WORKER_RESOURCE_LIMIT: para mandar ao Gemini o arquivo
// vira base64, que é um terço maior, e doze scans de celular na mesma função
// estouram a memória do worker. Cada chamada lê `lote` (quatro) e devolve
// quantos `restam`; a tela chama de novo até zerar, e de quebra ganha barra de
// progresso em vez de um minuto de ampulheta.
//
// QUEM JULGA NÃO É ESTA FUNÇÃO. O que volta daqui é o que o modelo disse, e o
// modelo erra. A conferência (dígito do CPF, data que existe, nome cruzado)
// mora em `src/lib/leituraDeDocumentos.ts`, testada, do lado de cá da tela.
// Guardar o cru é de propósito: a regra de conferência muda com o tempo e a
// leitura, não.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const MODELO = "gemini-2.5-flash";
const MIMES_OK = new Set([
  "application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
]);
/* Dez megas já é foto de documento muito acima do normal (os desta conversa
   têm entre 120 KB e 2 MB), e o base64 de um arquivo maior que isso é o que
   derruba o worker. */
const LIMITE_BYTES = 10 * 1024 * 1024;
/* Quantos por chamada. Quatro cabem na memória com folga e levam uns quinze
   segundos, que é o tanto que uma barra de progresso aguenta sem parecer travada. */
const LOTE_PADRAO = 4;

/* O prompt. Cada frase aqui existe por causa de um jeito conhecido de errar.

   "NÃO DEDUZA" porque modelo preenche para não devolver vazio, e campo
   inventado é o pior resultado possível: parece certo e ninguém confere. Medido
   nesta conversa: sem o esquema e sem esta regra, o modelo devolveu como
   "orgao_expedidor" o nome do diretor impresso no rodapé da carteira.

   "FILIAÇÃO NÃO É O TITULAR" porque no RG o nome da mãe vem logo abaixo do
   nome da pessoa, em rótulo parecido, e é o erro clássico da leitura de RG.

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
5. "orgao_expedidor" é a SIGLA com a UF, como SSP/AM ou DETRAN/AM. Nome de pessoa impresso no documento (diretor, chefe do instituto) NÃO é orgão expedidor.
6. "estado_civil" só se estiver escrito no documento. Certidão de casamento e RG às vezes trazem; conta de luz nunca traz.
7. "nascimento" no formato DD/MM/AAAA.
8. "endereco" é a linha completa: logradouro, número, complemento e bairro. O CEP vai separado, no campo "cep".
9. "tipo" é o que este documento é, em duas ou três palavras: "RG", "CPF", "CNH", "comprovante de residência", "certidão de casamento", "contracheque", "extrato bancário", "outro".

Responda só o JSON.`;

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    tipo: { type: "STRING" },
    nome: { type: "STRING" },
    cpf: { type: "STRING" },
    rg: { type: "STRING" },
    orgao_expedidor: { type: "STRING" },
    nascimento: { type: "STRING" },
    cep: { type: "STRING" },
    endereco: { type: "STRING" },
    profissao: { type: "STRING" },
    estado_civil: { type: "STRING" },
  },
  /* SEM `propertyOrdering`. Ele existe no SDK de Python, não na API REST, e foi
     o que pendurou as três tentativas em 25 segundos cada numa foto de 124 KB
     que o mesmo modelo lê em quatro. Medido lado a lado: o mesmo arquivo, o
     mesmo esquema, só sem esta linha, volta em 5,9s. */
  required: ["tipo", "nome", "cpf", "rg", "orgao_expedidor", "nascimento", "cep", "endereco", "profissao", "estado_civil"],
};

const CAMPOS = ["nome", "cpf", "rg", "orgao_expedidor", "nascimento", "cep", "endereco", "profissao", "estado_civil"];

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

/* O JSON que voltou, tirando o embrulho. O responseSchema já pede JSON puro,
   mas o modelo ainda devolve crase de vez em quando, e perder uma leitura boa
   por causa de três crases seria bobagem. */
function lerJson(texto: string): Record<string, string> | null {
  const t = (texto || "").trim();
  const tentar = (s: string) => {
    try {
      const v = JSON.parse(s);
      if (Array.isArray(v)) return v[0] && typeof v[0] === "object" ? v[0] : null;
      return v && typeof v === "object" ? v : null;
    } catch { return null; }
  };
  const direto = tentar(t);
  if (direto) return direto;
  const ini = t.indexOf("{"), fim = t.lastIndexOf("}");
  return ini >= 0 && fim > ini ? tentar(t.slice(ini, fim + 1)) : null;
}

/**
 * Uma leitura. Tenta três vezes: o free tier do Gemini é dez chamadas por
 * minuto, e uma rajada de leituras encosta nesse teto.
 */
async function lerComGemini(
  apiKey: string, bytes: Uint8Array, mime: string,
): Promise<{ campos: Record<string, string>; tipo: string } | { erro: string }> {
  if (!MIMES_OK.has(mime)) return { erro: `não sei ler ${mime}` };
  if (bytes.length > LIMITE_BYTES) return { erro: `arquivo grande demais (${Math.round(bytes.length / 1e6)} MB)` };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: mime, data: paraBase64(bytes) } }] }],
    generationConfig: {
      // Temperatura zero: não se quer criatividade na leitura de um RG.
      temperature: 0,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: ESQUEMA,
      /* PENSAMENTO DESLIGADO. O 2.5 Flash "pensa" por padrão, e numa leitura de
         documento isso é tempo e token gastos para transcrever o que está
         escrito. Copiar um CPF de uma imagem não é raciocínio, é leitura, e o
         que decide o que vale é a conferência do outro lado. */
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  /* Esperas curtas. O teto do free tier é dez chamadas por minuto e o lote é de
     quatro, então o 429 aqui é exceção, não rotina: esperar vinte segundos por
     via das dúvidas era o que fazia a tela parecer travada. */
  const esperas = [0, 3000, 7000];
  let ultimo = "";
  for (let i = 0; i < esperas.length; i++) {
    if (esperas[i]) await new Promise((r) => setTimeout(r, esperas[i]));
    let resp: Response;
    try {
      /* COM PRAZO. `fetch` sem sinal espera para sempre, e uma chamada
         pendurada come o orçamento das outras três do lote sem dar notícia.
         Vinte e cinco segundos é muito mais que os quatro ou seis que uma
         leitura leva: o que passar disso não vai voltar. */
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });
    } catch (e) {
      ultimo = `rede: ${String((e as Error)?.message || e)}`;
      continue;
    }
    if (resp.ok) {
      const data = await resp.json();
      const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const cru = lerJson(texto);
      if (!cru) {
        const razao = data?.candidates?.[0]?.finishReason ?? "sem motivo";
        return { erro: `resposta não veio em JSON (${razao}): ${String(texto).slice(0, 120)}` };
      }
      const campos: Record<string, string> = {};
      for (const c of CAMPOS) campos[c] = String(cru[c] ?? "").trim();
      return { campos, tipo: String(cru.tipo ?? "").trim() };
    }
    ultimo = `gemini ${resp.status}: ${(await resp.text()).slice(0, 160)}`;
    // 4xx que não seja 429 não melhora tentando de novo.
    if (resp.status !== 429 && resp.status < 500) break;
  }
  return { erro: ultimo || "não consegui ler" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const { conversa_id, paths, refazer = false, limite = 30, lote = LOTE_PADRAO } =
      await req.json().catch(() => ({}));
    if (!conversa_id) return j({ error: "conversa_id e obrigatorio" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return j({ error: "GEMINI_API_KEY nao configurada" }, 500);

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
    if (!anexos.length) return j({ conversa_id, leituras: [], restam: 0, recado: "nenhum documento do lead nesta conversa" });

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
        leituras.push({ path, documento: guardada.documento ?? nome, tipo: guardada.tipo, campos: guardada.campos, de_antes: true });
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
         estourar o relógio de novo, o número diz qual documento segurou, em vez
         de deixar adivinhar. */
      const t0 = Date.now();
      const r = await lerComGemini(apiKey, bytes, mime);
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
