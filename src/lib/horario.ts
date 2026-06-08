// Interpreta horário de funcionamento (principalmente o formato exportado
// do Google Maps, ex: "domingoFechado | segunda-feira09:00–19:00 | …")
// e diz se o estabelecimento está aberto ou fechado AGORA.
//
// Formatos livres (ex: "Seg-Sex 09:00 as 19:00") podem não ser
// interpretados — nesse caso as funções retornam null e a UI cai no texto
// cru (sem o selo aberto/fechado).

export type Intervalo = [number, number]; // minutos desde 00:00

const DIAS_TOKENS: { re: RegExp; dow: number }[] = [
  { re: /^domingo/, dow: 0 },
  { re: /^segunda(?:-feira)?/, dow: 1 },
  { re: /^terca(?:-feira)?/, dow: 2 },
  { re: /^quarta(?:-feira)?/, dow: 3 },
  { re: /^quinta(?:-feira)?/, dow: 4 },
  { re: /^sexta(?:-feira)?/, dow: 5 },
  { re: /^sabado/, dow: 6 },
];

const ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Remove glifos da área de uso privado (o Maps cola um ícone  entre
// os dias) e normaliza separadores pra exibição.
export function horarioLimpo(raw: string | null): string | null {
  if (!raw) return null;
  return raw
    .replace(/[-]/g, " ")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

// Quebra o texto em 7 posições (dom..sáb). undefined = dia não informado;
// null = fechado; array = intervalos abertos. Retorna null se não achou
// nenhum dia reconhecível.
export function parseHorario(raw: string | null): (Intervalo[] | null | undefined)[] | null {
  if (!raw) return null;
  const limpo = raw.replace(/[-]/g, " ");
  const partes = limpo.split(/[|\n;]+/).map(p => p.trim()).filter(Boolean);
  const semana: (Intervalo[] | null | undefined)[] = new Array(7).fill(undefined);
  let achou = false;
  for (const parte of partes) {
    const n = norm(parte);
    const dia = DIAS_TOKENS.find(d => d.re.test(n));
    if (!dia) continue;
    achou = true;
    const resto = n.replace(dia.re, "");
    if (/fechad|closed/.test(resto)) { semana[dia.dow] = null; continue; }
    if (/24\s*h|aberto\s*24|24\s*hora/.test(resto)) { semana[dia.dow] = [[0, 1440]]; continue; }
    const intervalos: Intervalo[] = [];
    const re = /(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(parte)) !== null) {
      const s = (+m[1]) * 60 + (+m[2]);
      const e = (+m[3]) * 60 + (+m[4]);
      if (e > s) intervalos.push([s, e]);
    }
    semana[dia.dow] = intervalos.length ? intervalos : null;
  }
  return achou ? semana : null;
}

// Selo aberto/fechado agora. null = não deu pra interpretar.
export function statusHorario(
  raw: string | null,
  now: Date = new Date(),
): { aberto: boolean; label: string; detalhe?: string } | null {
  const semana = parseHorario(raw);
  if (!semana) return null;
  const hoje = semana[now.getDay()];
  if (hoje === undefined) return null;
  if (hoje === null || hoje.length === 0) return { aberto: false, label: "Fechado agora" };
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const [s, e] of hoje) {
    if (mins >= s && mins < e) return { aberto: true, label: "Aberto agora", detalhe: `fecha ${fmtMin(e)}` };
  }
  const prox = hoje.find(([s]) => s > mins);
  return prox
    ? { aberto: false, label: "Fechado agora", detalhe: `abre ${fmtMin(prox[0])}` }
    : { aberto: false, label: "Fechado agora" };
}

// Horário de hoje em texto curto ("09:00–19:00", "Fechado hoje"). null se
// não interpretou.
export function resumoHoje(raw: string | null, now: Date = new Date()): string | null {
  const semana = parseHorario(raw);
  if (!semana) return null;
  const hoje = semana[now.getDay()];
  if (hoje === undefined) return null;
  if (hoje === null || hoje.length === 0) return "Fechado hoje";
  return hoje.map(([s, e]) => `${fmtMin(s)}–${fmtMin(e)}`).join(", ");
}

// Semana inteira formatada pra exibir no popup. null se não interpretou.
export function semanaFormatada(
  raw: string | null,
  now: Date = new Date(),
): { abrev: string; horas: string; hoje: boolean }[] | null {
  const semana = parseHorario(raw);
  if (!semana) return null;
  const dow = now.getDay();
  const out: { abrev: string; horas: string; hoje: boolean }[] = [];
  for (let d = 0; d < 7; d++) {
    const v = semana[d];
    if (v === undefined) continue;
    out.push({
      abrev: ABREV[d],
      horas: v === null || v.length === 0 ? "Fechado" : v.map(([s, e]) => `${fmtMin(s)}–${fmtMin(e)}`).join(", "),
      hoje: d === dow,
    });
  }
  return out.length ? out : null;
}
