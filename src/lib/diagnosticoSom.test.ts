import { test, expect } from "bun:test";
import { suporteDe, lerAchados, resumoParaColar, type Achados } from "./diagnosticoSom";

const OPUS = "audio/ogg; codecs=opus";

const achados = (o: Partial<Achados> = {}): Achados => ({
  suporte: { [OPUS]: "sim", "audio/webm; codecs=opus": "sim", "video/mp4": "sim" },
  webAudio: "ok",
  carregou: true,
  erroCodigo: null,
  andou: true,
  volume: 1,
  mudo: false,
  saidas: 2,
  ...o,
});

const titulos = (a: Achados) => lerAchados(a).map((v) => v.titulo);

test("o que o navegador responde vira palavra de gente", () => {
  expect(suporteDe("probably")).toBe("sim");
  expect(suporteDe("maybe")).toBe("talvez");
  expect(suporteDe("")).toBe("nao");
});

test("navegador sem codec nenhum é o navegador, não a máquina", () => {
  const v = lerAchados(achados({ suporte: { [OPUS]: "nao", "audio/webm; codecs=opus": "nao", "video/mp4": "nao" } }));
  expect(v[0].gravidade).toBe("erro");
  expect(v[0].titulo).toContain("não toca nenhum");
});

test("faltando só o Opus, o vídeo toca e o áudio do cliente não", () => {
  const v = lerAchados(achados({ suporte: { [OPUS]: "nao", "audio/webm; codecs=opus": "nao", "video/mp4": "sim" } }));
  expect(v[0].titulo).toContain("Opus");
});

/* O ACHADO QUE ENCERRA A DISCUSSÃO: tudo certo do lado do navegador quer dizer
   que o som existe e está saindo em outro lugar. */
test("tocando com tudo aberto manda para o ouvido, e não para o mixer", () => {
  const v = lerAchados(achados());
  expect(v).toHaveLength(1);
  expect(v[0].gravidade).toBe("aviso");
  expect(v[0].titulo).toContain("falta saber se o som chega");
  expect(v[0].detalhe).toContain("2 saídas");
  /* O MIXER NÃO PODE SER O CONSELHO AQUI. Ele abafaria o bling junto, e o
     bling toca: mandar mexer lá já custou uma rodada inteira de tentativa. */
  expect(v[0].passos.join(" ")).not.toContain("Mixer");
  expect(v[0].passos.join(" ")).toContain("três sons");
});

test("com uma saída só, não inventa que há várias", () => {
  expect(lerAchados(achados({ saidas: 1 }))[0].detalhe).not.toContain("saídas");
});

test("carregou e não andou é bloqueio de reprodução, não codec", () => {
  const t = titulos(achados({ andou: false }));
  expect(t).toContain("O navegador carregou mas não deixou tocar");
  expect(t).not.toContain("O navegador está tocando, mas o som sai em outro lugar");
});

test("o tocador no mudo é dito com todas as letras", () => {
  expect(titulos(achados({ mudo: true }))).toContain("O tocador está no mudo");
  expect(titulos(achados({ volume: 0 }))).toContain("O tocador está no mudo");
});

test("erro de mídia vira frase, não número solto", () => {
  const v = lerAchados(achados({ carregou: false, erroCodigo: 4 }));
  expect(v[0].detalhe).toContain("recusou o formato");
  const semCodigo = lerAchados(achados({ carregou: false, erroCodigo: null }));
  expect(semCodigo[0].detalhe).toContain("não conseguiu carregar");
});

test("mais de um problema ao mesmo tempo aparece por inteiro", () => {
  const t = titulos(achados({ suporte: { [OPUS]: "nao", "audio/webm; codecs=opus": "sim", "video/mp4": "sim" }, mudo: true }));
  expect(t).toContain("Falta o decodificador de Opus");
  expect(t).toContain("O tocador está no mudo");
});

test("sem achado nenhum, diz que está tudo certo em vez de ficar mudo", () => {
  // testes não rodados: nada a concluir, e a tela precisa dizer alguma coisa
  const v = lerAchados(achados({ carregou: null, andou: null }));
  expect(v).toHaveLength(1);
  expect(v[0].gravidade).toBe("ok");
});

test("o resumo cabe numa mensagem", () => {
  const txt = resumoParaColar(achados(), "Chrome 130 Windows");
  expect(txt).toContain("Chrome 130 Windows");
  expect(txt).toContain(OPUS);
  expect(txt).toContain("Volume do tocador: 100%");
  expect(txt).not.toContain("Erro de mídia");
  expect(resumoParaColar(achados({ erroCodigo: 3 }), "x")).toContain("não deu para decodificar");
});

/* ══════════════════ os três sons ═══════════════════════════════════════════ */

import { bipeWav, ondeParou, type OQueOuviu } from "./diagnosticoSom";

const ouviu = (o: Partial<OQueOuviu> = {}): OQueOuviu =>
  ({ bling: null, bipe: null, voz: null, video: null, ...o });

test("o bipe é um WAV válido, com cabeçalho RIFF e o tamanho declarado certo", () => {
  const uri = bipeWav(0.5, 440, 8000);
  expect(uri.startsWith("data:audio/wav;base64,")).toBe(true);

  const bytes = Buffer.from(uri.split(",")[1], "base64");
  const n = 0.5 * 8000;
  expect(bytes.length).toBe(44 + n);
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
  expect(bytes.subarray(36, 40).toString()).toBe("data");
  // os dois tamanhos do cabeçalho têm que bater com o arquivo de verdade
  expect(bytes.readUInt32LE(4)).toBe(36 + n);
  expect(bytes.readUInt32LE(40)).toBe(n);
  // PCM, mono, 8 bits, na taxa pedida
  expect(bytes.readUInt16LE(20)).toBe(1);
  expect(bytes.readUInt16LE(22)).toBe(1);
  expect(bytes.readUInt32LE(24)).toBe(8000);
  expect(bytes.readUInt16LE(34)).toBe(8);
});

test("o bipe abre e fecha em silêncio, e no meio tem onda de verdade", () => {
  const bytes = Buffer.from(bipeWav(0.5).split(",")[1], "base64");
  const dados = bytes.subarray(44);
  // 128 é o silêncio no PCM de 8 bits sem sinal
  expect(dados[0]).toBe(128);
  expect(dados[dados.length - 1]).toBe(128);
  const pico = Math.max(...dados.map((v) => Math.abs(v - 128)));
  expect(pico).toBeGreaterThan(80);
});

test("sem as respostas ainda não há conclusão", () => {
  expect(ondeParou(ouviu())).toBeNull();
  expect(ondeParou(ouviu({ bling: true }))).toBeNull();
  // com bipe ouvido, a voz ainda é necessária
  expect(ondeParou(ouviu({ bling: true, bipe: true }))).toBeNull();
});

test("bling sai e bipe não: é o Windows abafando a mídia, e não o formato", () => {
  const v = ondeParou(ouviu({ bling: true, bipe: false }))!;
  expect(v.gravidade).toBe("erro");
  expect(v.titulo).toContain("não é problema de formato");
  expect(v.passos.join(" ")).toContain("Comunicações");
  // não pode mandar trocar de navegador: o formato não é o problema aqui
  expect(v.passos.join(" ")).not.toContain("Chrome");
});

test("bipe sai e voz não: aí sim é o Opus", () => {
  const v = ondeParou(ouviu({ bling: true, bipe: true, voz: false, video: true }))!;
  expect(v.titulo).toContain("Opus");
  expect(v.passos.join(" ")).toContain("Chrome");
});

test("nada sai: o navegador inteiro está mudo, e o caminho é o mixer", () => {
  const v = ondeParou(ouviu({ bling: false, bipe: false }))!;
  expect(v.gravidade).toBe("erro");
  expect(v.passos.join(" ")).toContain("Mixer");
});

test("os três saem: está de pé, e a suspeita passa a ser daquele áudio", () => {
  const v = ondeParou(ouviu({ bling: true, bipe: true, voz: true, video: true }))!;
  expect(v.gravidade).toBe("ok");
  expect(v.titulo).toContain("Todos os sons");
});

/* ── o vídeo entra na conta ────────────────────────────────────────────────
 *
 * Relato novo e mais preciso: o vídeo também está mudo. Vídeo é MP4/AAC e
 * áudio do WhatsApp é Ogg/Opus; máquina nenhuma perde as duas famílias e
 * segue tocando o resto do navegador. Os dois juntos apontam para o arquivo
 * não chegar, e não para decodificador faltando. */

test("sem a resposta do vídeo ainda não há conclusão", () => {
  expect(ondeParou(ouviu({ bling: true, bipe: true, voz: true }))).toBeNull();
  expect(ondeParou(ouviu({ bling: true, bipe: true, voz: false }))).toBeNull();
});

test("voz e vídeo mudos juntos é o arquivo não chegando, e não o formato", () => {
  const v = ondeParou(ouviu({ bling: true, bipe: true, voz: false, video: false }))!;
  expect(v.gravidade).toBe("erro");
  expect(v.titulo).toContain("vem do servidor");
  expect(v.passos.join(" ")).toMatch(/4G|firewall|anônima/);
  // não pode culpar o Opus: o vídeo nem é Opus
  expect(v.detalhe).not.toContain("Opus");
});

test("vídeo toca e voz não: aí o Opus é o único suspeito", () => {
  const v = ondeParou(ouviu({ bling: true, bipe: true, voz: false, video: true }))!;
  expect(v.titulo).toContain("Opus");
});

test("só o vídeo mudo é o volume do tocador do próprio navegador", () => {
  const v = ondeParou(ouviu({ bling: true, bipe: true, voz: true, video: false }))!;
  expect(v.gravidade).toBe("aviso");
  expect(v.titulo).toContain("Só o vídeo");
  expect(v.passos.join(" ")).toContain("barrinha");
});

test("o bipe mudo decide antes de o vídeo ser perguntado", () => {
  // com o bipe mudo, o vídeo não acrescenta nada: a conclusão já saiu
  const v = ondeParou(ouviu({ bling: true, bipe: false }))!;
  expect(v.titulo).toContain("não é problema de formato");
});

test("o resumo junta o que ouviu, a máquina e o que o navegador respondeu", () => {
  const txt = resumoParaColar(
    achados(),
    "ua",
    { bling: true, bipe: false, voz: null, video: null },
    { navegador: "Chrome 141", plataforma: "Windows 11", webAudio: "ok, 48000 Hz",
      saidas: "2", tocador: "volume 100%, não mudo" },
  );
  expect(txt).toContain("O QUE ELA OUVIU");
  expect(txt).toContain("OUVIU");
  expect(txt).toContain("NÃO ouviu");
  expect(txt).toContain("não respondeu");
  expect(txt).toContain("A MÁQUINA");
  expect(txt).toContain("Chrome 141");
  expect(txt).toContain("O QUE O NAVEGADOR RESPONDEU");
});

test("o resumo funciona com só uma das partes, e nunca sai vazio", () => {
  expect(resumoParaColar(null, "ua", { bling: true, bipe: true, voz: true, video: true }, null))
    .toContain("O QUE ELA OUVIU");
  expect(resumoParaColar(achados(), "ua", null, null)).toContain("O QUE O NAVEGADOR RESPONDEU");
  expect(resumoParaColar(null, "ua/1.0", null, null)).toContain("ua/1.0");
});

/* ── quem está mexendo no tocador ─────────────────────────────────────────── */

import { eNativa, lerInterferencia, type Interferencia } from "./diagnosticoSom";

const interf = (o: Partial<Interferencia> = {}): Interferencia =>
  ({ trocadas: [], volumeDepois: 1, mudoDepois: false, ...o });

test("eNativa reconhece função do navegador e função trocada", () => {
  expect(eNativa(Math.max)).toBe(true);
  expect(eNativa(function espia() { return 1; })).toBe(false);
  // o que não é função não acusa ninguém
  expect(eNativa(undefined)).toBe(true);
  expect(eNativa(null)).toBe(true);
  expect(eNativa(42)).toBe(true);
});

test("eNativa erra para o lado de não acusar quando toString mente", () => {
  const mentiroso = function () { return 1; };
  mentiroso.toString = () => { throw new Error("nada disso"); };
  // Function.prototype.toString ignora o toString próprio, então isto segue
  // sendo detectável; o que não pode é explodir
  expect(() => eNativa(mentiroso)).not.toThrow();
});

test("sem sinal nenhum, não inventa culpado", () => {
  expect(lerInterferencia(interf())).toBeNull();
});

test("volume derrubado depois do play é o achado forte, e vira erro", () => {
  const v = lerInterferencia(interf({ volumeDepois: 0 }))!;
  expect(v.gravidade).toBe("erro");
  expect(v.titulo).toContain("baixando o volume");
  expect(v.detalhe).toContain("0%");
  expect(v.passos[0]).toContain("anônima");
  /* A CAÇA É POR METADE. Uma a uma, com vinte extensões, são vinte rodadas
     de desligar, recarregar e ouvir: é onde a pessoa desiste no meio. */
  expect(v.passos.join(" ")).toContain("METADE");
  expect(v.passos.join(" ")).not.toContain("uma a uma");
});

test("mudo ligado por fora conta igual, mesmo com volume cheio", () => {
  const v = lerInterferencia(interf({ mudoDepois: true }))!;
  expect(v.gravidade).toBe("erro");
  expect(v.detalhe).toContain("no mudo");
});

test("volume quase cheio não é acusação: arredondamento não é extensão", () => {
  expect(lerInterferencia(interf({ volumeDepois: 0.999 }))).toBeNull();
  expect(lerInterferencia(interf({ volumeDepois: 1 }))).toBeNull();
});

test("função de mídia trocada é aviso, e diz qual foi", () => {
  const v = lerInterferencia(interf({ trocadas: ["play", "volume"] }))!;
  expect(v.gravidade).toBe("aviso");
  expect(v.titulo).toContain("extensão");
  expect(v.detalhe).toContain("play, volume");
});

test("com os dois sinais, o volume manda, porque é o que a pessoa sente", () => {
  const v = lerInterferencia(interf({ trocadas: ["play"], volumeDepois: 0.2 }))!;
  expect(v.gravidade).toBe("erro");
  expect(v.titulo).toContain("baixando o volume");
});

test("o resumo carrega o que foi MEDIDO sobre o tocador", () => {
  const txt = resumoParaColar(null, "ua", null, null,
    { trocadas: ["play", "volume"], volumeDepois: 0, mudoDepois: true });
  expect(txt).toContain("QUEM MEXEU NO TOCADOR");
  expect(txt).toContain("0%");
  expect(txt).toContain("(MUDO)");
  expect(txt).toContain("play, volume");
});

test("sem interferência, o resumo diz 'nenhuma' em vez de omitir", () => {
  const txt = resumoParaColar(null, "ua", null, null,
    { trocadas: [], volumeDepois: 1, mudoDepois: false });
  expect(txt).toContain("Funções de mídia trocadas: nenhuma");
  expect(txt).toContain("100%");
});
