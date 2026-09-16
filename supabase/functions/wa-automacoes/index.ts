// wa-automacoes — o executor dos fluxos montados na aba Automações.
//
// Roda a cada minuto, chamado pelo cron. Faz três coisas, nesta ordem:
//
//   1. VARRE o que só o tempo sabe: "lead sem responder há N dias" não tem
//      gatilho de tabela, porque o acontecimento é a AUSÊNCIA de linha nova.
//   2. TOMA da fila o que está vencido (`fn_wa_automacoes_tomar`), marcando
//      como 'rodando' no mesmo comando — duas chamadas simultâneas do cron não
//      pegam a mesma execução.
//   3. RODA os passos de cada uma, do ponto em que ela parou.
//
// ────────────────────── por que o executor existe aqui ──────────────────────
//
// Quase tudo isto seria possível em SQL puro, menos a primeira coisa que o
// gatilho da base precisa: ABRIR CONVERSA. O lead que chegou na planilha não
// tem conversa nenhuma, e abrir uma exige perguntar à Evolution se aquele
// número existe no WhatsApp. Isso é HTTP, e HTTP dentro de um gatilho de banco
// transforma cada INSERT numa aposta contra a rede.
//
// ───────────────────────── a espera não segura nada ─────────────────────────
//
// "Espere dois dias" não é um `sleep`. Ao chegar num passo de espera, o
// executor devolve a execução para a fila com `rodar_em` no futuro e sai. Dois
// dias depois o cron a pega de novo, no passo em que ela parou. É por isso que
// um fluxo de trinta dias não custa nada enquanto não é a hora dele.
//
// ─────────────────────── o envio não sai por aqui ───────────────────────────
//
// Passo de mensagem vai para `wa_agendadas` (via `fn_wa_automacao_enviar`), e
// não direto para a Evolution. Aquela fila já tem o despachante de minuto, as
// três tentativas, a trava de uma mensagem por minuto por número e a aba
// Programadas. Mensagem de robô fica visível no mesmo lugar em que se vê
// mensagem marcada à mão, que é onde alguém vai procurar quando perguntar "por
// que esse lead recebeu isso?".
//
// ─────────────────────────── o "Se" tem dois lados ──────────────────────────
//
// O passo "Se" bifurca: um lado sim, um lado não, cada um com passos próprios.
// O executor não anda numa árvore, anda numa LISTA: a fila principal com cada
// "Se" seguido dos passos do lado que ele escolheu (`achatar`, em
// fluxoDePassos.ts, o mesmo arquivo que a tela usa, por link simbólico). Ao
// chegar num "Se" ainda sem decisão, pergunta ao banco
// (`fn_wa_automacao_condicao`), GRAVA o lado na execução e achata de novo.
// Como a decisão entra antes de avançar, nenhum índice anterior muda, e a
// posição continua sendo um número que sobrevive a uma espera de dois dias.
//
// Env (secrets): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EVOLUTION_URL,
// EVOLUTION_APIKEY_GLOBAL (ou EVOLUTION_APIKEY).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { achatar, type Decisoes, type Ramo } from "./fluxoDePassos.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

/** 55 + DDD + 9 dígitos. Mesma regra do fn_wa_canonico e do src/lib/phone.ts. */
function canonico(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);
  return d.length === 11 ? "55" + d : "";
}

interface Condicao {
  tipo?: "ja_escreveu" | "respondeu" | "campo";
  campo?: string;
  op?: string;
  valor?: string;
}

interface Passo {
  id: string;
  tipo: "mensagem" | "esperar" | "parar_se_respondeu" | "se" | "mover_etapa" | "tarefa";
  texto?: string;
  midias?: unknown[];
  minutos?: number;
  etapa?: string;
  titulo?: string;
  dias?: number;
  /** se */
  condicao?: Condicao;
  entao?: Passo[];
  senao?: Passo[];
}

interface Execucao {
  id: string;
  automacao_id: string;
  conversa_id: string | null;
  lead_bruto_id: string | null;
  telefone: string | null;
  passo: number;
  tentativas: number;
  disparada_em: string;
  /** o lado que cada "Se" já tomou nesta execução */
  decisoes: Decisoes | null;
  instancia: string;
  nome: string;
  passos: Passo[];
  condicoes: {
    so_horario_comercial?: boolean;
    teto_dia?: number;
    /** em quais faixas do dia este fluxo pode mandar; vazia = a qualquer hora */
    faixas?: string[];
    /** quem chegou fora da faixa recebe quando abrir, ou não recebe */
    retroativo?: boolean;
  } | null;
  gatilho: string;
  /** disparada a mão pelo botão Testar agora */
  teste?: boolean;
}

/** "já nos escreveu: sim", para o histórico dizer por onde o lead foi. */
function fraseDaDecisao(c: Condicao | undefined, ramo: Ramo): string {
  const lado = ramo === "entao" ? "sim" : "não";
  const t = c?.tipo ?? "ja_escreveu";
  if (t === "ja_escreveu") return `já nos escreveu: ${lado}`;
  if (t === "respondeu") return `respondeu: ${lado}`;
  return `${c?.campo ?? "coluna"} ${c?.op ?? "contem"} “${c?.valor ?? ""}”: ${lado}`;
}

/**
 * A Evolution conhece esse número?
 *
 * `null` é "não deu pra saber", e null NÃO é "não existe" — só o `false`
 * explícito recusa. Mesma regra da wa-nova-conversa: bloquear o fluxo porque
 * uma verificação opcional falhou seria trocar um problema raro por um
 * garantido.
 */
async function existeNoWhatsapp(base: string, apikey: string, instancia: string, numero: string): Promise<boolean | null> {
  try {
    const r = await fetch(`${base}/chat/whatsappNumbers/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ numbers: [numero] }),
    });
    if (!r.ok) return null;
    const dados = await r.json();
    const lista = Array.isArray(dados) ? dados : Array.isArray(dados?.data) ? dados.data : null;
    if (!lista || lista.length === 0) return null;
    return typeof lista[0]?.exists === "boolean" ? lista[0].exists : null;
  } catch {
    return null;
  }
}

/**
 * A conversa por onde o fluxo vai falar. Abre uma se ainda não existe.
 *
 * Só o gatilho da base cai aqui: os outros partem de uma conversa que já
 * existe. O nome do lead vem da planilha, e é ele que faz o `{nome}` da
 * mensagem funcionar na primeira mensagem — antes de a pessoa responder, é a
 * única coisa que sabemos dela.
 */
async function conversaDaExecucao(sb: any, e: Execucao, evo: { base: string; apikey: string }): Promise<{ id: string | null; erro: string | null }> {
  if (e.conversa_id) return { id: e.conversa_id, erro: null };

  let telefone = canonico(e.telefone || "");
  let nome: string | null = null;

  if (e.lead_bruto_id) {
    const { data: lead } = await sb
      .from("leads_brutos").select("telefone, nome").eq("id", e.lead_bruto_id).maybeSingle();
    if (lead) {
      telefone = canonico(lead.telefone || telefone);
      nome = lead.nome ?? null;
    }
  }
  if (!telefone) return { id: null, erro: "Telefone fora do formato brasileiro." };

  const { data: jaTem } = await sb
    .from("wa_conversas").select("id, arquivada")
    .ilike("instancia", e.instancia).eq("telefone", telefone).maybeSingle();

  if (jaTem) {
    if (jaTem.arquivada) await sb.from("wa_conversas").update({ arquivada: false }).eq("id", jaTem.id);
    return { id: jaTem.id as string, erro: null };
  }

  if (evo.base && evo.apikey) {
    const existe = await existeNoWhatsapp(evo.base, evo.apikey, e.instancia, telefone);
    if (existe === false) return { id: null, erro: "Esse número não tem WhatsApp." };
  }

  const { data: nova, error } = await sb.from("wa_conversas").insert({
    instancia: e.instancia,
    telefone,
    jid: `${telefone}@s.whatsapp.net`,
    nome_wa: nome,
    nao_lidas: 0,
    // Fomos nós que fomos até a pessoa: outbound por definição.
    origem: "outbound",
    ultima_em: new Date().toISOString(),
    ultima_previa: null,
  }).select("id").single();

  if (error) return { id: null, erro: error.message };

  // Mesma regra do resto do sistema: se esse telefone está numa base, a conversa
  // guarda de qual, e o lead sai da fila bruta.
  await sb.rpc("fn_wa_vincular_base", { p_conversa: nova.id });

  return { id: nova.id as string, erro: null };
}

/** Uma execução, do passo em que parou até onde der. */
async function rodar(sb: any, e: Execucao, evo: { base: string; apikey: string }): Promise<string> {
  const arvore = Array.isArray(e.passos) ? e.passos : [];
  const decisoes: Decisoes = { ...(e.decisoes ?? {}) };
  /* A lista que roda. Cresce quando um "Se" decide, sempre DEPOIS do índice
     atual: é isso que deixa `i` continuar valendo. */
  let passos = achatar(arvore, decisoes);
  const caminhos: string[] = [];
  /* EM QUE FAIXAS DO DIA ESTE FLUXO MANDA.
     Lista vazia é "a qualquer hora". Fluxo salvo antes das faixas existirem
     não tem a lista, e o que ele tem é o interruptor antigo, que queria dizer
     exatamente "só na faixa de atendimento" — a mesma leitura que o
     `faixasDaAutomacao` do lado da tela faz.

     O TESTE SAI NA HORA. Quem aperta "Testar agora" às nove da noite quer ver
     a mensagem às nove da noite; segurar até a próxima janela faria o teste
     parecer que não funcionou, que é justamente o problema que o botão existe
     para resolver. */
  const faixas: string[] | null = e.teste === true
    ? null
    : Array.isArray(e.condicoes?.faixas)
      ? (e.condicoes!.faixas!.length >= 3 ? [] : e.condicoes!.faixas!)
      : (e.condicoes?.so_horario_comercial !== false ? ["atendimento"] : []);
  const retroativo = e.condicoes?.retroativo !== false;

  const { id: conversa, erro } = await conversaDaExecucao(sb, e, evo);
  if (!conversa) {
    await sb.rpc("fn_wa_automacao_desfecho", {
      p_id: e.id, p_status: "falhou", p_erro: erro || "Não consegui abrir a conversa.",
    });
    return "falhou";
  }

  let i = Math.max(0, Number(e.passo) || 0);

  while (i < passos.length) {
    const p = passos[i];

    if (p.tipo === "se") {
      /* Já decidido (retomada depois de uma espera): é só marcador, passa. */
      if (!decisoes[p.id]) {
        const { data: sim, error } = await sb.rpc("fn_wa_automacao_condicao", {
          p_conversa: conversa, p_desde: e.disparada_em, p_cond: p.condicao ?? { tipo: "ja_escreveu" },
        });
        if (error) throw new Error(`passo ${i + 1} (se): ${error.message}`);
        const ramo: Ramo = sim === true ? "entao" : "senao";
        decisoes[p.id] = ramo;
        /* GRAVA ANTES DE AVANÇAR. Se o processo cair entre gravar e o próximo
           passo, a retomada achata igual e cai no mesmo lugar. */
        const { error: eDec } = await sb.rpc("fn_wa_automacao_decidir", { p_id: e.id, p_passo: p.id, p_ramo: ramo });
        if (eDec) throw new Error(`passo ${i + 1} (se): ${eDec.message}`);
        caminhos.push(fraseDaDecisao(p.condicao, ramo));
        passos = achatar(arvore, decisoes);
      }
      i += 1;
      continue;
    }

    if (p.tipo === "esperar") {
      const min = Math.max(1, Math.min(Number(p.minutos) || 1, 60 * 24 * 30));
      await sb.rpc("fn_wa_automacao_desfecho", {
        p_id: e.id,
        p_status: "pendente",
        p_passo: i + 1,
        p_rodar_em: new Date(Date.now() + min * 60_000).toISOString(),
        p_conversa: conversa,
        p_detalhe: `esperando ${min} min antes do passo ${i + 2}`,
      });
      return "esperando";
    }

    if (p.tipo === "parar_se_respondeu") {
      const { data: respondeu } = await sb.rpc("fn_wa_automacao_respondeu", {
        p_conversa: conversa, p_desde: e.disparada_em,
      });
      if (respondeu === true) {
        await sb.rpc("fn_wa_automacao_desfecho", {
          p_id: e.id, p_status: "parada", p_passo: i, p_conversa: conversa,
          p_detalhe: "o lead respondeu; o resto do fluxo não foi enviado",
        });
        return "parada";
      }
    }

    if (p.tipo === "mensagem") {
      const { data: envio, error } = await sb.rpc("fn_wa_automacao_enviar", {
        p_conversa: conversa,
        p_texto: p.texto ?? "",
        p_midias: Array.isArray(p.midias) ? p.midias : [],
        p_faixas: faixas,
        p_retroativo: retroativo,
      });
      if (error) throw new Error(`passo ${i + 1} (mensagem): ${error.message}`);

      /* FORA DA FAIXA E SEM RETROATIVO: O FLUXO PARA AQUI, e diz isso.
         Antes o envio devolvia só um id, e nulo servia para tudo — texto
         vazio, conversa que sumiu, fora do horário. A execução seguia em
         frente como se a mensagem tivesse saído, e quem fosse perguntar por
         que o lead não recebeu encontrava um histórico dizendo "concluída".
         Seguir para os próximos passos também seria errado: esperar dois dias
         e mandar a segunda mensagem de quem nunca recebeu a primeira. */
      const r = (Array.isArray(envio) ? envio[0] : envio) as { motivo?: string | null } | null;
      if (r?.motivo === "fora_da_faixa") {
        await sb.rpc("fn_wa_automacao_desfecho", {
          p_id: e.id, p_status: "parada", p_passo: i, p_conversa: conversa,
          p_detalhe: "chegou fora da faixa de horário do fluxo, que não guarda quem chega fora",
        });
        return "parada";
      }
    }

    if (p.tipo === "mover_etapa" && p.etapa) {
      /* Sem `etapas_puladas`: quem empurra o lead aqui é uma regra, não alguém
         pulando degrau na tela, e a jornada do banco continua sendo a dona da
         ordem. */
      const { error } = await sb.from("wa_conversas").update({ etapa: p.etapa }).eq("id", conversa);
      if (error) throw new Error(`passo ${i + 1} (etapa): ${error.message}`);
    }

    if (p.tipo === "tarefa" && (p.titulo || "").trim()) {
      const dias = Math.max(0, Math.min(Number(p.dias) || 0, 365));
      const dia = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
      const { error } = await sb.from("wa_tasks").insert({
        conversa_id: conversa,
        titulo: (p.titulo || "").trim().slice(0, 200),
        detalhe: `Criada pela automação “${e.nome}”.`,
        dia,
        tipo: "lembrete",
      });
      if (error) throw new Error(`passo ${i + 1} (tarefa): ${error.message}`);
    }

    i += 1;
  }

  /* Quantos passos DE VERDADE rodaram: o marcador do "Se" não conta. E por
     onde foi, para quem abrir o histórico não precisar adivinhar. */
  const feitos = passos.filter((p) => p.tipo !== "se").length;
  const porOnde = caminhos.length > 0 ? ` · ${caminhos.join("; ")}` : "";
  await sb.rpc("fn_wa_automacao_desfecho", {
    p_id: e.id, p_status: "concluida", p_passo: i, p_conversa: conversa,
    p_detalhe: `${feitos} passo(s) executado(s)${e.teste ? " (teste)" : ""}${porOnde}`,
  });
  return "concluida";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const evo = {
    base: (Deno.env.get("EVOLUTION_URL") || "").replace(/\/+$/, ""),
    // Global primeiro: chave de instância morre quando a instância é recriada.
    apikey: Deno.env.get("EVOLUTION_APIKEY_GLOBAL") || Deno.env.get("EVOLUTION_APIKEY") || "",
  };

  try {
    const sb = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

    // 1. o que só o tempo sabe
    const { data: varridas } = await sb.rpc("fn_wa_automacoes_varrer");

    // 2. o que está vencido
    const { data: fila, error: eFila } = await sb.rpc("fn_wa_automacoes_tomar", { p_limite: 25 });
    if (eFila) return json({ ok: false, error: eFila.message });

    const execucoes = (fila || []) as Execucao[];
    const contagem: Record<string, number> = {};
    /* Alguma execução chegou a pôr mensagem na fila de envio? Se sim, vale
       acordar o despachante em vez de esperar o minuto dele. */
    let temMensagem = false;

    for (const e of execucoes) {
      try {
        const fim = await rodar(sb, e, evo);
        if (fim === "concluida" || fim === "esperando") temMensagem = true;
        contagem[fim] = (contagem[fim] ?? 0) + 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[wa-automacoes] ${e.nome}:`, msg);
        /* TRÊS TENTATIVAS, DEPOIS PARA. Mesma conta da fila de mensagens: erro
           de rede passa na segunda; passo escrito errado não passa nunca, e
           repetir para sempre encheria o histórico e a conta do Google. */
        const desiste = Number(e.tentativas) >= 3;
        await sb.rpc("fn_wa_automacao_desfecho", {
          p_id: e.id,
          p_status: desiste ? "falhou" : "pendente",
          p_rodar_em: desiste ? null : new Date(Date.now() + 5 * 60_000).toISOString(),
          p_erro: msg.slice(0, 400),
        });
        contagem[desiste ? "falhou" : "retentar"] = (contagem[desiste ? "falhou" : "retentar"] ?? 0) + 1;
      }
    }

    /* ACORDA O DESPACHANTE EM VEZ DE ESPERAR O MINUTO DELE.
       Medido: a mensagem ficava 62 segundos parada em `wa_agendadas` esperando
       o próximo tique do cron, depois de tudo o mais já estar pronto. Ele só
       toma o que está vencido (`quando <= now()`), então uma chamada a mais não
       antecipa nada que devesse esperar: a mensagem marcada para daqui a dois
       dias continua lá. Sem `await`: o envio não segura esta resposta. */
    if (temMensagem) {
      fetch(`${URL_SB}/functions/v1/wa-despachar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
        body: "{}",
      }).catch((err) => console.error("[wa-automacoes] acordar despachante:", err));
    }

    return json({ ok: true, varridas: varridas ?? 0, tomadas: execucoes.length, contagem });
  } catch (e) {
    console.error("[wa-automacoes]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
