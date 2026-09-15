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
// Env (secrets): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EVOLUTION_URL,
// EVOLUTION_APIKEY_GLOBAL (ou EVOLUTION_APIKEY).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

interface Passo {
  id?: string;
  tipo: "mensagem" | "esperar" | "parar_se_respondeu" | "mover_etapa" | "tarefa";
  texto?: string;
  midias?: unknown[];
  minutos?: number;
  etapa?: string;
  titulo?: string;
  dias?: number;
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
  instancia: string;
  nome: string;
  passos: Passo[];
  condicoes: { so_horario_comercial?: boolean; teto_dia?: number } | null;
  gatilho: string;
  /** disparada a mão pelo botão Testar agora */
  teste?: boolean;
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
  const passos = Array.isArray(e.passos) ? e.passos : [];
  /* O TESTE SAI NA HORA. Quem aperta "Testar agora" às nove da noite quer ver
     a mensagem às nove da noite; segurar até a próxima janela de atendimento
     faria o teste parecer que não funcionou, que é justamente o problema que o
     botão existe para resolver. */
  const soComercial = e.condicoes?.so_horario_comercial !== false && e.teste !== true;

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
      const { error } = await sb.rpc("fn_wa_automacao_enviar", {
        p_conversa: conversa,
        p_texto: p.texto ?? "",
        p_midias: Array.isArray(p.midias) ? p.midias : [],
        p_so_comercial: soComercial,
      });
      if (error) throw new Error(`passo ${i + 1} (mensagem): ${error.message}`);
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

  await sb.rpc("fn_wa_automacao_desfecho", {
    p_id: e.id, p_status: "concluida", p_passo: i, p_conversa: conversa,
    p_detalhe: `${passos.length} passo(s) executado(s)${e.teste ? " (teste)" : ""}`,
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

    for (const e of execucoes) {
      try {
        const fim = await rodar(sb, e, evo);
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

    return json({ ok: true, varridas: varridas ?? 0, tomadas: execucoes.length, contagem });
  } catch (e) {
    console.error("[wa-automacoes]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
