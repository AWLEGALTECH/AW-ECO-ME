import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Archive, ArrowLeft, Search, ChevronRight, CalendarDays, User } from "lucide-react";

interface Arquivado {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  arquivado_em: string;
  arquivado_por: string | null;
  arquivado_motivo: string | null;
  ultimo_contato_em: string | null;
}

const fmtData = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(String(d).length <= 10 ? `${d}T00:00:00` : d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("pt-BR");
};

// Quanto tempo faz desde a última tentativa de contato. É a informação que
// diz se ainda vale a pena tentar de novo.
const desde = (d?: string | null) => {
  if (!d) return null;
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  if (isNaN(dt.getTime())) return null;
  const dias = Math.floor((Date.now() - dt.getTime()) / 86400000);
  if (dias < 0) return null;
  if (dias === 0) return "hoje";
  if (dias === 1) return "há 1 dia";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
};

/**
 * Os clientes que saíram da lista de ativos. Cada linha já mostra o porquê e a
 * data da última tentativa de contato — quem vem aqui está tentando decidir se
 * algum deles merece uma nova tentativa, e essa decisão não deveria exigir
 * abrir ficha por ficha.
 */
export default function ClientesArquivados() {
  const navigate = useNavigate();
  useEffect(() => { document.title = "Clientes arquivados · AW ECO ME"; }, []);

  const [lista, setLista] = useState<Arquivado[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const [{ data }, { data: profs }] = await Promise.all([
      (supabase.from("clientes" as never) as never as any)
        .select("id, nome, cpf_cnpj, arquivado_em, arquivado_por, arquivado_motivo, ultimo_contato_em")
        .not("arquivado_em", "is", null)
        .order("arquivado_em", { ascending: false }),
      supabase.from("profiles").select("id, nome"),
    ]);
    const m: Record<string, string> = {};
    for (const p of ((profs || []) as any[])) m[String(p.id)] = String(p.nome || "");
    setNomes(m);
    setLista((data || []) as Arquivado[]);
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const q = busca.trim().toLowerCase();
  const filtrados = q
    ? lista.filter((c) =>
        c.nome.toLowerCase().includes(q) ||
        (c.cpf_cnpj ?? "").toLowerCase().includes(q) ||
        (c.arquivado_motivo ?? "").toLowerCase().includes(q))
    : lista;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate("/clientes")} className="-ml-2 text-muted-foreground">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Clientes
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-xl bg-amber-400/10 ring-1 ring-amber-400/25 text-amber-300 grid place-items-center shrink-0">
            <Archive className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-medium tracking-tight">Clientes arquivados</h1>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              Fora da lista de ativos. Nada foi apagado — processos, contratos e histórico continuam na ficha.
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, CPF ou motivo"
            className="pl-9 h-9"
          />
        </div>
      </div>

      {carregando ? (
        <p className="text-center text-muted-foreground py-10">Carregando…</p>
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-14 text-center">
          <Archive className="h-7 w-7 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground">
            {lista.length === 0
              ? "Nenhum cliente arquivado."
              : `Nenhum arquivado com “${busca.trim()}”.`}
          </p>
          {lista.length === 0 && (
            <p className="text-[11.5px] text-muted-foreground/70 mt-1.5">
              Arquivar é feito na área restrita, no rodapé da ficha do cliente.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtrados.map((c) => {
            const ha = desde(c.ultimo_contato_em);
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/clientes/${c.id}`)}
                className="w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-primary/40 hover:bg-white/[0.04] p-4 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <p className="text-[14px] font-medium text-foreground break-words">{c.nome}</p>
                      {c.cpf_cnpj && <span className="text-[11px] text-muted-foreground tabular-nums">{c.cpf_cnpj}</span>}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 mt-1.5">
                      <span className="text-[11.5px] text-muted-foreground inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3 w-3 opacity-70" />
                        Último contato {fmtData(c.ultimo_contato_em)}
                        {ha && <span className="text-amber-300/80">· {ha}</span>}
                      </span>
                      <span className="text-[11.5px] text-muted-foreground inline-flex items-center gap-1.5">
                        <Archive className="h-3 w-3 opacity-70" />
                        Arquivado em {fmtData(c.arquivado_em)}
                      </span>
                      {c.arquivado_por && nomes[c.arquivado_por] && (
                        <span className="text-[11.5px] text-muted-foreground inline-flex items-center gap-1.5">
                          <User className="h-3 w-3 opacity-70" />
                          por <strong className="text-foreground/75 font-medium">{nomes[c.arquivado_por]}</strong>
                        </span>
                      )}
                    </div>

                    {c.arquivado_motivo && (
                      <p className="text-[12.5px] text-foreground/75 leading-relaxed mt-2 border-l-2 border-amber-400/30 pl-2.5 whitespace-pre-wrap break-words">
                        {c.arquivado_motivo}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0 mt-1 group-hover:text-primary/60 transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
