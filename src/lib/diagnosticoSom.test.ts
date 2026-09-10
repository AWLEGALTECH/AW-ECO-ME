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
test("tocando com tudo aberto aponta para fora do navegador", () => {
  const v = lerAchados(achados());
  expect(v).toHaveLength(1);
  expect(v[0].gravidade).toBe("aviso");
  expect(v[0].titulo).toContain("sai em outro lugar");
  expect(v[0].detalhe).toContain("2 saídas");
  expect(v[0].passos.length).toBeGreaterThan(2);
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
