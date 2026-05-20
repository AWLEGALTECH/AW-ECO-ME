import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, Eye, Trash2, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

interface Processo {
  id: string;
  numero_processo: string;
  cliente_id: string;
  materia: string | null;
  data_ultimo_andamento: string | null;
  prazo_processual: string | null;
  fase_processual: string | null;
  tipo_pendencia: string | null;
  status_tarefa: string | null;
  vara_juizo_origem: string | null;
  valor_causa: number | null;
  comarca_uf: string | null;
  parceiro: string | null;
  clientes?: { nome: string } | null;
}

const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export default function Processos() {
  useEffect(() => { document.title = "Processos — AW ECO ME"; }, []);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtroFase = searchParams.get("fase");
  const filtroMateria = searchParams.get("materia");
  const filtroParceiro = searchParams.get("parceiro");
  const filtroComarca = searchParams.get("comarca");
  const filtroVara = searchParams.get("vara");
  const filtroStatus = searchParams.get("status");
  const filtroPendencia = searchParams.get("pendencia");

  const fetchAll = useCallback(async () => {
    const { data } = await supabase
      .from("processos")
      .select("id, numero_processo, cliente_id, materia, data_ultimo_andamento, prazo_processual, fase_processual, tipo_pendencia, status_tarefa, vara_juizo_origem, valor_causa, comarca_uf, parceiro, clientes(nome)")
      .order("data_ultimo_andamento", { ascending: false, nullsFirst: false });
    if (data) setProcessos(data as unknown as Processo[]);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fasesUnicas = useMemo(() => {
    const set = new Set<string>();
    processos.forEach((p) => p.fase_processual && set.add(p.fase_processual));
    return Array.from(set).sort();
  }, [processos]);

  const materiasUnicas = useMemo(() => {
    const set = new Set<string>();
    processos.forEach((p) => p.materia && set.add(p.materia));
    return Array.from(set).sort();
  }, [processos]);

  const parceirosUnicos = useMemo(() => {
    const set = new Set<string>();
    processos.forEach((p) => p.parceiro && set.add(p.parceiro));
    return Array.from(set).sort();
  }, [processos]);

  const filtered = useMemo(() => {
    return processos.filter((p) => {
      if (filtroFase && p.fase_processual !== filtroFase) return false;
      if (filtroMateria && p.materia !== filtroMateria) return false;
      if (filtroParceiro && p.parceiro !== filtroParceiro) return false;
      if (filtroComarca && p.comarca_uf !== filtroComarca) return false;
      if (filtroVara && p.vara_juizo_origem !== filtroVara) return false;
      if (filtroStatus && p.status_tarefa !== filtroStatus) return false;
      if (filtroPendencia && p.tipo_pendencia !== filtroPendencia) return false;
      if (search) {
        const s = search.toLowerCase();
        const inNumero = p.numero_processo.toLowerCase().includes(s);
        const inCliente = (p.clientes?.nome ?? "").toLowerCase().includes(s);
        const inMateria = (p.materia ?? "").toLowerCase().includes(s);
        if (!inNumero && !inCliente && !inMateria) return false;
      }
      return true;
    });
  }, [processos, filtroFase, filtroMateria, filtroParceiro, filtroComarca, filtroVara, filtroStatus, filtroPendencia, search]);

  const valorTotal = useMemo(() =>
    filtered.reduce((sum, p) => sum + (Number(p.valor_causa) || 0), 0),
    [filtered]
  );

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("processos").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Processo removido"); setDeleteId(null); fetchAll();
  };

  const setFilter = (key: string, value: string | null) => {
    if (value && value !== "__all__") searchParams.set(key, value);
    else searchParams.delete(key);
    setSearchParams(searchParams);
  };

  const clearAllFilters = () => { setSearchParams({}); setSearch(""); };

  const hasFilters = !!(filtroFase || filtroMateria || filtroParceiro || filtroComarca || filtroVara || filtroStatus || filtroPendencia || search);

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-display text-3xl font-bold">Processos</h2>
        <Button onClick={() => navigate("/processos/novo")}><Plus className="h-4 w-4 mr-2" />Novo Processo</Button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5">
          <span className="text-sm font-medium">{filtered.length}</span>
          <span className="text-sm text-muted-foreground">de {processos.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5">
          <span className="text-sm text-muted-foreground">Total causa:</span>
          <span className="text-sm font-medium">{fmtBRL(valorTotal)}</span>
        </div>
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={clearAllFilters} className="gap-2">
            <X className="h-3.5 w-3.5" />Limpar filtros
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nº, cliente ou matéria..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Select value={filtroFase ?? "__all__"} onValueChange={(v) => setFilter("fase", v)}>
              <SelectTrigger><SelectValue placeholder="Fase" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as fases</SelectItem>
                {fasesUnicas.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroMateria ?? "__all__"} onValueChange={(v) => setFilter("materia", v)}>
              <SelectTrigger><SelectValue placeholder="Matéria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as matérias</SelectItem>
                {materiasUnicas.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroParceiro ?? "__all__"} onValueChange={(v) => setFilter("parceiro", v)}>
              <SelectTrigger><SelectValue placeholder="Parceiro" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os parceiros</SelectItem>
                {parceirosUnicos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº Processo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Matéria</TableHead>
                <TableHead>Fase</TableHead>
                <TableHead className="hidden lg:table-cell">Comarca/UF</TableHead>
                <TableHead className="hidden lg:table-cell">Últ. Andamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-16">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/processos/${p.id}`)}>
                  <TableCell className="font-mono text-xs">{p.numero_processo}</TableCell>
                  <TableCell className="font-medium">{p.clientes?.nome ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{p.materia || "—"}</TableCell>
                  <TableCell>{p.fase_processual ? <Badge variant="secondary" className="text-[10px]">{p.fase_processual}</Badge> : "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{p.comarca_uf || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{fmtDate(p.data_ultimo_andamento)}</TableCell>
                  <TableCell className="text-right">{fmtBRL(p.valor_causa)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => navigate(`/processos/${p.id}`)}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum processo encontrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
