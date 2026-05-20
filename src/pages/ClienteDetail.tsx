import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
}

interface ProcessoLite {
  id: string;
  numero_processo: string;
  materia: string | null;
  fase_processual: string | null;
  valor_causa: number | null;
}

const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function ClienteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [processos, setProcessos] = useState<ProcessoLite[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: cli }, { data: procs }] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", id).single(),
      supabase.from("processos").select("id, numero_processo, materia, fase_processual, valor_causa").eq("cliente_id", id).order("data_ultimo_andamento", { ascending: false, nullsFirst: false }),
    ]);
    if (cli) setCliente(cli);
    if (procs) setProcessos(procs);
  }, [id]);

  useEffect(() => {
    document.title = "Cliente — AW ECO ME";
    load();
  }, [load]);

  const handleSave = async () => {
    if (!cliente) return;
    setSaving(true);
    const { error } = await supabase
      .from("clientes")
      .update({
        nome: cliente.nome,
        cpf_cnpj: cliente.cpf_cnpj,
        telefone: cliente.telefone,
        email: cliente.email,
        endereco: cliente.endereco,
        observacoes: cliente.observacoes,
      })
      .eq("id", cliente.id);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar"); return; }
    toast.success("Cliente atualizado");
  };

  if (!cliente) {
    return <div className="text-center text-muted-foreground py-8">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/clientes")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />{saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>{cliente.nome}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Nome</Label><Input value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} /></div>
          <div><Label>CPF/CNPJ</Label><Input value={cliente.cpf_cnpj ?? ""} onChange={(e) => setCliente({ ...cliente, cpf_cnpj: e.target.value })} /></div>
          <div><Label>Telefone</Label><Input value={cliente.telefone ?? ""} onChange={(e) => setCliente({ ...cliente, telefone: e.target.value })} /></div>
          <div><Label>E-mail</Label><Input type="email" value={cliente.email ?? ""} onChange={(e) => setCliente({ ...cliente, email: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Endereço</Label><Input value={cliente.endereco ?? ""} onChange={(e) => setCliente({ ...cliente, endereco: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Observações</Label><Textarea rows={3} value={cliente.observacoes ?? ""} onChange={(e) => setCliente({ ...cliente, observacoes: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Processos ({processos.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº Processo</TableHead>
                <TableHead>Matéria</TableHead>
                <TableHead>Fase</TableHead>
                <TableHead className="text-right">Valor da Causa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processos.map((p) => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link to={`/processos/${p.id}`} className="hover:underline">{p.numero_processo}</Link>
                  </TableCell>
                  <TableCell>{p.materia || "—"}</TableCell>
                  <TableCell>{p.fase_processual ? <Badge variant="secondary">{p.fase_processual}</Badge> : "—"}</TableCell>
                  <TableCell className="text-right">{fmtBRL(p.valor_causa)}</TableCell>
                </TableRow>
              ))}
              {processos.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhum processo.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
