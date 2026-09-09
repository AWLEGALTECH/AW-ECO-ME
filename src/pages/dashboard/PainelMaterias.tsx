/* MATÉRIAS E AÇÕES: contra quem, sobre o quê, em que fase.
 *
 * É a carteira vista pela classificação que a faxina de dados produziu: matéria
 * padronizada, rubricas do catálogo e requerido por processo. Antes disto o
 * agrupamento por matéria tinha 137 nomes e não dizia nada.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, Landmark, Layers, ListChecks, Handshake, AlertCircle, Tags } from "lucide-react";
import { Tile, Painel, Numero, BarList, countBy } from "./comum";

interface Processo {
  id: string;
  materia: string | null;
  materia_rubricas: string[] | null;
  requeridos: string[] | null;
  fase_processual: string | null;
  tipo_pendencia: string | null;
  parceiro: string | null;
}

export default function PainelMaterias() {
  const navigate = useNavigate();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [reus, setReus] = useState<Record<string, string>>({});
  const [rubricas, setRubricas] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: r }, { data: m }] = await Promise.all([
        supabase.from("processos").select("id, materia, materia_rubricas, requeridos, fase_processual, tipo_pendencia, parceiro"),
        supabase.from("requeridos_catalogo" as never).select("chave, nome"),
        supabase.from("materias_catalogo" as never).select("chave, rotulo"),
      ]);
      if (p) setProcessos(p as unknown as Processo[]);
      if (r) setReus(Object.fromEntries((r as unknown as { chave: string; nome: string }[]).map((x) => [x.chave, x.nome])));
      if (m) setRubricas(Object.fromEntries((m as unknown as { chave: string; rotulo: string }[]).map((x) => [x.chave, x.rotulo])));
    })();
  }, []);

  const total = processos.length;
  const porMateria = useMemo(() => countBy(processos, (p) => p.materia), [processos]);
  const porReu = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of processos) for (const k of p.requeridos ?? []) m.set(reus[k] ?? k, (m.get(reus[k] ?? k) ?? 0) + 1);
    return [...m, ].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [processos, reus]);
  const porRubrica = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of processos) for (const k of p.materia_rubricas ?? []) m.set(rubricas[k] ?? k, (m.get(rubricas[k] ?? k) ?? 0) + 1);
    return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [processos, rubricas]);
  const porFase = useMemo(() => countBy(processos, (p) => p.fase_processual), [processos]);
  const porParceiro = useMemo(() => countBy(processos, (p) => p.parceiro), [processos]);
  const porPendencia = useMemo(() => countBy(processos, (p) => p.tipo_pendencia), [processos]);
  const bradesco = useMemo(() => processos.filter((p) => (p.requeridos ?? []).some((k) => reus[k] === "BANCO BRADESCO")).length, [processos, reus]);
  const semRequerido = useMemo(() => processos.filter((p) => !p.requeridos?.length).length, [processos]);
  const totalRubricas = porRubrica.reduce((s, r) => s + r.value, 0);
  const totalParceiro = porParceiro.reduce((s, r) => s + r.value, 0);
  const comPendencia = processos.filter((p) => p.tipo_pendencia).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile i={0} rotulo="Matérias" valor={<Numero value={porMateria.length} />} sub="Nomes distintos na carteira" icone={ClipboardList} />
        <Tile i={1} rotulo="Requeridos" valor={<Numero value={porReu.length} />} icone={Landmark}
              sub={semRequerido > 0 ? `${semRequerido} processos ainda sem réu` : "Todos os processos com réu"} />
        <Tile i={2} rotulo="Contra o Bradesco" destaque tom="text-primary" valor={<Numero value={bradesco} />}
              sub={total ? `${Math.round((100 * bradesco) / total)}% da carteira` : undefined} />
        <Tile i={3} rotulo="Rubricas" valor={<Numero value={porRubrica.length} />} sub={`${totalRubricas} ocorrências em ${total} processos`} icone={Tags} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Painel i={4} titulo="Processos por matéria" icone={ClipboardList} descricao="Clique numa matéria para abrir a lista.">
          <BarList data={porMateria} total={total} max={14} onItemClick={(n) => navigate(`/processos?materia=${encodeURIComponent(n)}`)} />
        </Painel>
        <Painel i={5} titulo="Por requerido" icone={Landmark} descricao="Litisconsórcio conta o processo em cada réu.">
          <BarList data={porReu} total={total} max={12} />
        </Painel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Painel i={6} titulo="Rubricas mais presentes" icone={Layers} descricao="O que cada processo cobra, somando as que aparecem juntas.">
          <BarList data={porRubrica} total={totalRubricas} max={14} />
        </Painel>
        <Painel i={7} titulo="Fase processual" icone={ListChecks} direita={<span className="text-xs text-muted-foreground">{porFase.length} fases</span>}>
          <BarList data={porFase} total={total} max={14} onItemClick={(n) => navigate(`/processos?fase=${encodeURIComponent(n)}`)} />
        </Painel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Painel i={8} titulo="Parceiro" icone={Handshake} descricao={`${totalParceiro} processos em parceria.`}>
          <BarList data={porParceiro} total={totalParceiro || 1} max={10} emptyMessage="Nenhum processo com parceiro."
                   onItemClick={(n) => navigate(`/processos?parceiro=${encodeURIComponent(n)}`)} />
        </Painel>
        <Painel i={9} titulo="Tipo de pendência" icone={AlertCircle} descricao={`${comPendencia} processos com pendência.`}>
          <BarList data={porPendencia} total={comPendencia || 1} max={10} emptyMessage="Nenhuma pendência aberta."
                   onItemClick={(n) => navigate(`/processos?pendencia=${encodeURIComponent(n)}`)} />
        </Painel>
      </div>
    </div>
  );
}
