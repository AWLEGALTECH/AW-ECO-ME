import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart } from "@/components/DonutChart";
import { Briefcase, Users, AlertTriangle, CalendarClock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Stats {
  total_processos: number;
  total_clientes: number;
  valor_total_causas: number;
  prazos_proximos: number;
}

interface FaseCount { fase: string; count: number }
interface MateriaCount { materia: string; count: number }

export default function Dashboard() {
  useEffect(() => { document.title = "Dashboard — AW ECO ME"; }, []);
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ total_processos: 0, total_clientes: 0, valor_total_causas: 0, prazos_proximos: 0 });
  const [fases, setFases] = useState<FaseCount[]>([]);
  const [materias, setMaterias] = useState<MateriaCount[]>([]);

  useEffect(() => {
    const load = async () => {
      const [{ count: procCount }, { count: cliCount }, { data: procs }] = await Promise.all([
        supabase.from("processos").select("*", { count: "exact", head: true }),
        supabase.from("clientes").select("*", { count: "exact", head: true }),
        supabase.from("processos").select("valor_causa, fase_processual, materia, prazo_processual"),
      ]);

      const valorTotal = (procs ?? []).reduce((s, p) => s + (Number(p.valor_causa) || 0), 0);
      const hoje = new Date().toISOString().slice(0, 10);
      const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const prazosProx = (procs ?? []).filter((p) => p.prazo_processual && p.prazo_processual >= hoje && p.prazo_processual <= em7dias).length;

      const faseMap = new Map<string, number>();
      (procs ?? []).forEach((p) => {
        const k = p.fase_processual || "Sem fase";
        faseMap.set(k, (faseMap.get(k) || 0) + 1);
      });
      setFases(Array.from(faseMap.entries()).map(([fase, count]) => ({ fase, count })).sort((a, b) => b.count - a.count).slice(0, 10));

      const matMap = new Map<string, number>();
      (procs ?? []).forEach((p) => {
        const k = p.materia || "Sem matéria";
        matMap.set(k, (matMap.get(k) || 0) + 1);
      });
      setMaterias(Array.from(matMap.entries()).map(([materia, count]) => ({ materia, count })).sort((a, b) => b.count - a.count).slice(0, 10));

      setStats({
        total_processos: procCount ?? 0,
        total_clientes: cliCount ?? 0,
        valor_total_causas: valorTotal,
        prazos_proximos: prazosProx,
      });
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Visão geral dos processos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SpotlightCard onClick={() => navigate("/processos")} className="cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Processos</p>
              <p className="text-3xl font-bold font-display mt-1">{stats.total_processos}</p>
            </div>
            <Briefcase className="h-8 w-8 text-cyan-400/60" />
          </div>
        </SpotlightCard>

        <SpotlightCard onClick={() => navigate("/clientes")} className="cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Clientes</p>
              <p className="text-3xl font-bold font-display mt-1">{stats.total_clientes}</p>
            </div>
            <Users className="h-8 w-8 text-violet-400/60" />
          </div>
        </SpotlightCard>

        <SpotlightCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Valor Total</p>
              <p className="text-2xl font-bold font-display mt-1">{fmtBRL(stats.valor_total_causas)}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-emerald-400/60" />
          </div>
        </SpotlightCard>

        <SpotlightCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Prazos (7 dias)</p>
              <p className="text-3xl font-bold font-display mt-1">{stats.prazos_proximos}</p>
            </div>
            <CalendarClock className="h-8 w-8 text-amber-400/60" />
          </div>
        </SpotlightCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por Fase</CardTitle></CardHeader>
          <CardContent>
            <DonutChart
              data={fases.map((f) => ({ name: f.fase, value: f.count }))}
              onSliceClick={(name) => navigate(`/processos?fase=${encodeURIComponent(name)}`)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 Matérias</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {materias.map((m) => (
                <div
                  key={m.materia}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.03] cursor-pointer"
                  onClick={() => navigate(`/processos?materia=${encodeURIComponent(m.materia)}`)}
                >
                  <span className="text-sm">{m.materia}</span>
                  <span className="text-sm font-mono text-muted-foreground">{m.count}</span>
                </div>
              ))}
              {materias.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem dados.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
