/* SUBIR OS ANEXOS PRO BUCKET.
 *
 * Separado de `anexos.ts` porque aquele arquivo é só forma — tipos e conversão,
 * sem depender de nada. Este toca no Storage, e juntar os dois obrigaria quem
 * quisesse testar a conversão a subir meio Supabase junto.
 */
import { supabase } from "@/integrations/supabase/client";
import { tipoDoMime } from "@/lib/retencao";
import { nomeSeguro, type AnexoLocal, type Midia } from "@/lib/anexos";

/**
 * Sobe os arquivos e devolve a lista pronta para a linha.
 *
 * UM POR VEZ, EM ORDEM, e não em paralelo. Paralelo seria mais rápido em alguns
 * segundos e embaralharia a ordem de chegada em caso de retry — e a ordem é
 * justamente o que a pessoa escolheu ao anexar. Com quatro arquivos de escritório
 * a diferença de tempo não se percebe; a ordem trocada se percebe do outro lado.
 *
 * Se um falha, a função inteira falha: subir três de quatro e agendar assim
 * mandaria uma mensagem incompleta na madrugada, e ninguém saberia qual faltou.
 */
/**
 * O caminho do bucket de volta como arquivo, para a barra de envio.
 *
 * É o que faz um anexo guardado (o modelo, o atalho) entrar na conversa pela
 * MESMA porta de um arquivo escolhido no computador: a partir daqui não há
 * diferença entre os dois, e o envio, a pré-visualização e o "remover" não
 * precisam saber de onde ele veio.
 *
 * O que não baixar é pulado, e não derruba o resto: um anexo apagado do bucket
 * não pode impedir os outros três de irem.
 */
export async function baixarMidias(midias: Midia[]): Promise<AnexoLocal[]> {
  const prontos: AnexoLocal[] = [];
  for (const m of midias) {
    const { data, error } = await supabase.storage.from("wa-midia").download(m.path);
    if (error || !data) { console.warn("[anexos] não baixou:", m.path, error?.message); continue; }
    prontos.push({
      arquivo: new File([data], m.nome || "arquivo", { type: m.mime || data.type }),
      duracao: m.duracao ?? null,
    });
  }
  return prontos;
}

export async function subirAnexos(
  anexos: AnexoLocal[], pasta: string,
): Promise<Midia[]> {
  const prontos: Midia[] = [];
  for (const a of anexos) {
    const mime = a.arquivo.type || "application/octet-stream";
    const nome = a.arquivo.name || "arquivo";
    // O índice no nome evita colisão entre dois arquivos escolhidos no mesmo
    // milissegundo — que é exatamente o que acontece quando se seleciona vários
    // de uma vez.
    const path = `${pasta}/${Date.now()}_${prontos.length}_${nomeSeguro(nome)}`;
    const { error } = await supabase.storage
      .from("wa-midia").upload(path, a.arquivo, { contentType: mime, upsert: false });
    if (error) throw new Error(`Não consegui subir "${nome}": ${error.message}`);
    prontos.push({
      path, mime, nome,
      tipo: tipoDoMime(mime),
      duracao: a.duracao ?? null,
    });
  }
  return prontos;
}
