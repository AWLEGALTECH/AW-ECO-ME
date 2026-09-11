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
// Secrets: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// ───────────────────────────── o que esta função faz ────────────────────────
//
//   POST { conversa_id, paths?, refazer?, lote? }  ->  { leituras, restam }
//
// Baixa cada anexo, manda ao modelo UM DE CADA VEZ e guarda o cru em
// `wa_leitura_documentos`. Devolve o que leu, sem julgar nada.
//
// UM DE CADA VEZ, e não os nove juntos, por dois motivos que valem o custo:
//   1. saber DE QUAL documento saiu cada campo (a tela mostra, a pessoa confere)
//   2. quando dois documentos discordam, ver a discordância em vez de receber
//      uma média inventada
//
// QUEM ESCOLHE O QUE LER É A PESSOA. A tela pergunta antes de gastar e manda os
// `paths` marcados: uma conversa de doze anexos tem, quase sempre, três que
// interessam (o RG, o comprovante e o CPF), e ler os doze para achar os três é
// jogar nove fora.
//
// E POUCOS POR CHAMADA. A primeira versão lia os doze anexos de uma vez e morria
// com WORKER_RESOURCE_LIMIT: para mandar ao modelo o arquivo vira base64, que é
// um terço maior, e doze scans de celular na mesma função estouram a memória do
// worker. Cada chamada lê `lote` (quatro) e devolve quantos `restam`; a tela
// chama de novo até zerar, e de quebra ganha barra de progresso.
//
// O CHAMADOR É O MESMO QUE O `spy-analisar` JÁ USA. Endpoint `/v1/responses`,
// `text.format` com json_schema estrito, corte duro por AbortController e a
// distinção entre 429 de ritmo e 429 de crédito acabado. Isso não foi escrito
// de novo aqui: foi copiado de código que já roda em produção neste projeto,
// porque helper de rede reescrito de memória é onde nascem os bugs mudos.
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

/* `gpt-4o` e não o mini. A diferença é de centavos por documento e o que está
   em jogo é transcrever dígito de CPF e número de RG de uma foto torta. A
   conferência do outro lado pega CPF com dígito errado, mas NÃO pega RG errado,
   endereço errado nem nome da mãe no lugar do titular. O `spy-insights` já faz
   a mesma escolha pelo mesmo motivo. */
const MODELO = "gpt-4o";

/* O que o modelo enxerga como imagem. HEIC do iPhone não entra: o WhatsApp
   quase sempre converte para JPEG antes de enviar, e quando não converte é
   melhor dizer isso na tela do que mandar bytes que voltam em erro. */
const IMAGENS_OK = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

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
   fecha e o achado é descartado em vez de entrar errado na procuração.

   O CEP GANHOU PESO porque o Writer, recebendo oito dígitos, busca no ViaCEP e
   preenche logradouro, bairro, município e UF sozinho. Ou seja: o CEP vale mais
   que a linha de endereço inteira, e o número da casa é a única parte que ele
   não revela. Por isso os dois são pedidos em separado, e nessa ordem.

   E O CEP PRECISA DIZER DE QUEM É. A primeira versão desta regra mandava
   procurar "em qualquer carimbo ou rodapé", e isso é exatamente onde mora o CEP
   da CONCESSIONÁRIA. Medido: o mesmo comprovante, lido duas vezes, devolveu
   dois CEPs e dois bairros diferentes. Conta de luz tem dois endereços na mesma
   folha, e o que interessa é o do bloco de entrega, ao lado do nome do titular.
   Na dúvida, vazio: CEP errado manda a peça para a comarca errada, e isso a
   conferência do outro lado não tem como pegar. */
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
8. O CEP É O CAMPO MAIS IMPORTANTE DO ENDEREÇO, e tem que ser O DO CLIENTE. Conta de luz, água e telefone trazem DOIS ou mais CEPs: o do cliente, junto do nome dele no bloco de entrega, e o da concessionária, no cabeçalho, no rodapé e ao lado do CNPJ. Pegue o do bloco de entrega, o que fica perto do nome do titular. Na dúvida entre dois, devolva vazio: CEP errado manda a peça para a comarca errada. Oito dígitos, no campo "cep", sozinho.
9. "endereco" é a linha do logradouro com o NÚMERO da casa, escrito assim: "Rua das Flores, nº 422, Apto 2, Centro". O número é a única parte que o CEP não revela, então não o deixe de fora quando estiver impresso.
10. "tipo" é o que este documento é, em duas ou três palavras: "RG", "CPF", "CNH", "comprovante de residência", "certidão de casamento", "contracheque", "extrato bancário", "outro".`;

const CAMPOS = [
  "nome", "cpf", "rg", "orgao_expedidor", "nascimento",
  "cep", "endereco", "profissao", "estado_civil",
] as const;

/* `strict: true` exige `additionalProperties: false` e TODOS os campos em
   `required`. Com isso o modelo não tem como devolver outra coisa, e some a
   etapa de caçar JSON dentro de crase, que era metade dos erros antes. */
const SCHEMA_FICHA = {
  type: "json_schema", name: "ficha_do_documento", strict: true,
  schema: {
    type: "object", additionalProperties: false,
    required: ["tipo", ...CAMPOS],
    properties: Object.fromEntries(
      ["tipo", ...CAMPOS].map((c) => [c, { type: "string" }]),
    ),
  },
};

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

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  if (signal) signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("timeout")); }, { once: true });
});

/* O CHAMADOR, copiado do `spy-analisar` que já roda em produção. Corte duro por
   tempo (AbortController), e a diferença entre 429 de ritmo (espera e tenta de
   novo) e 429 de crédito acabado (desiste na hora, porque insistir não traz
   crédito de volta). */
async function openai(content: unknown[], maxTokens: number, timeoutMs = 45000): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let lastErr = "";
  const tries = 3;
  try {
    for (let attempt = 1; attempt <= tries; attempt++) {
      if (ac.signal.aborted) throw new Error("timeout_openai");
      try {
        const r = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: MODELO,
            input: [{ role: "user", content }],
            max_output_tokens: maxTokens,
            // Zero: não se quer criatividade na leitura de um RG.
            temperature: 0,
            text: { format: SCHEMA_FICHA },
          }),
          signal: ac.signal,
        });
        if (r.status === 429) {
          const body = (await r.text()).slice(0, 300);
          lastErr = `openai 429: ${body.slice(0, 180)}`;
          if (/insufficient_quota|no credits|billing/i.test(body)) {
            throw new Error(`sem_creditos: ${body.slice(0, 140)}`);
          }
          if (attempt < tries) { await sleep(Math.min(attempt * 4000, 10000), ac.signal); continue; }
          throw new Error(lastErr);
        }
        if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 260)}`);
        const d = await r.json();
        if (Array.isArray(d.output)) {
          for (const o of d.output) {
            for (const c of (o.content || [])) {
              if (c?.type === "refusal" && c.refusal) throw new Error(`recusa: ${String(c.refusal).slice(0, 200)}`);
            }
          }
        }
        if (d.status === "incomplete") throw new Error(`incompleto: ${d.incomplete_details?.reason || "?"}`);
        let txt = d.output_text;
        if (!txt && Array.isArray(d.output)) {
          for (const o of d.output) {
            for (const c of (o.content || [])) if (typeof c.text === "string") { txt = c.text; break; }
          }
        }
        if (txt) return txt;
        throw new Error("resposta vazia");
      } catch (e) {
        lastErr = String((e as Error)?.message || e);
        if (ac.signal.aborted || /aborted|the operation was aborted|timeout/i.test(lastErr)) {
          throw new Error("timeout_openai");
        }
        if (/sem_creditos|insufficient_quota|no credits/i.test(lastErr)) break;
        if (attempt < tries) await sleep(1500, ac.signal);
      }
    }
    throw new Error(lastErr || "openai falhou");
  } finally { clearTimeout(timer); }
}

const parseJson = (s: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(String(s).replace(/^```json\s*|```$/g, "").trim());
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch { return null; }
};

/** O bloco do anexo: `input_file` para PDF, `input_image` para foto. */
function anexoParaBloco(bytes: Uint8Array, mime: string, nome: string) {
  const dados = paraBase64(bytes);
  if (mime.includes("pdf")) {
    // O modelo abre o PDF sozinho, então scan e foto seguem pelo mesmo caminho.
    return { type: "input_file", filename: nome.endsWith(".pdf") ? nome : `${nome}.pdf`,
             file_data: `data:application/pdf;base64,${dados}` };
  }
  if (!IMAGENS_OK.has(mime)) return null;
  const m = mime === "image/jpg" ? "image/jpeg" : mime;
  return { type: "input_image", image_url: `data:${m};base64,${dados}` };
}

async function lerDocumento(
  bytes: Uint8Array, mime: string, nome: string,
): Promise<{ campos: Record<string, string>; tipo: string } | { erro: string }> {
  if (bytes.length > LIMITE_BYTES) {
    return { erro: `arquivo grande demais (${Math.round(bytes.length / 1e6)} MB)` };
  }
  const bloco = anexoParaBloco(bytes, mime, nome);
  if (!bloco) return { erro: `não sei ler ${mime}` };

  try {
    const txt = await openai([bloco, { type: "input_text", text: PROMPT }], 1200);
    const ficha = parseJson(txt);
    if (!ficha) return { erro: `resposta não veio em JSON: ${String(txt).slice(0, 120)}` };
    const campos: Record<string, string> = {};
    for (const c of CAMPOS) campos[c] = String(ficha[c] ?? "").trim();
    return { campos, tipo: String(ficha.tipo ?? "").trim() };
  } catch (e) {
    return { erro: String((e as Error)?.message || e).slice(0, 220) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const { conversa_id, paths, refazer = false, limite = 30, lote = LOTE_PADRAO } =
      await req.json().catch(() => ({}));
    if (!conversa_id) return j({ error: "conversa_id e obrigatorio" }, 400);
    if (!Deno.env.get("OPENAI_API_KEY")) return j({ error: "OPENAI_API_KEY nao configurado" }, 500);

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
      const r = await lerDocumento(bytes, mime, nome);
      const ms = Date.now() - t0;

      if ("erro" in r) {
        leituras.push({ path, documento: nome, erro: r.erro, ms });
        novas.push({ conversa_id, midia_path: path, documento: nome, campos: {}, erro: r.erro, modelo: MODELO });
        continue;
      }
      leituras.push({ path, documento: nome, tipo: r.tipo, campos: r.campos, ms });
      /* `erro: null` EXPLÍCITO. O upsert só toca nas colunas que vão no
         payload, então sem esta linha a leitura que deu certo herdava o erro da
         tentativa anterior: a linha ficava com campos preenchidos E com o texto
         do 429 antigo. A tela usa a presença de `erro` para decidir se a leitura
         vale, então o resultado bom era descartado e relido a cada abertura,
         para sempre. Apareceu no primeiro teste de verdade, com o Luan. */
      novas.push({
        conversa_id, midia_path: path, documento: nome,
        tipo: r.tipo, campos: r.campos, erro: null, modelo: MODELO,
      });
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
