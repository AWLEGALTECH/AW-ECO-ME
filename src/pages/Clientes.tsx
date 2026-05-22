import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Search, Eye, Trash2, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  processos_count?: number;
}

export default function Clientes() {
  useEffect(() => { document.title = "Clientes — AW ECO ME"; }, []);
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", cpf_cnpj: "", telefone: "", email: "" });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    const { data: clientesData } = await supabase
      .from("clientes")
      .select("id, nome, cpf_cnpj, telefone, email")
      .order("nome", { ascending: true });
    if (!clientesData) return;

    const { data: counts } = await supabase
      .from("processos")
      .select("cliente_id");
    const countMap = new Map<string, number>();
    (counts || []).forEach((p) => {
      countMap.set(p.cliente_id, (countMap.get(p.cliente_id) || 0) + 1);
    });

    setClientes(clientesData.map((c) => ({ ...c, processos_count: countMap.get(c.id) || 0 })));
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = clientes.filter((c) =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.cpf_cnpj ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    const { error } = await supabase.from("clientes").insert({
      nome: form.nome.trim(),
      cpf_cnpj: form.cpf_cnpj.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.code === "23505" ? "Cliente já existe" : "Erro ao salvar");
      return;
    }
    toast.success("Cliente adicionado");
    setOpen(false);
    setForm({ nome: "", cpf_cnpj: "", telefone: "", email: "" });
    fetchAll();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("clientes").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir (cliente pode ter processos vinculados)"); return; }
    toast.success("Cliente removido"); setDeleteId(null); fetchAll();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-3xl font-medium tracking-tight">Clientes</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              <div><Label>CPF/CNPJ</Label><Input value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
              <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou CPF/CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">CPF/CNPJ</TableHead>
                <TableHead className="hidden md:table-cell">Telefone</TableHead>
                <TableHead className="w-24">Processos</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/clientes/${c.id}`)}>
                  <TableCell className="font-medium hover:underline">
                    <span className="inline-flex items-center gap-3">
                      <span className="h-11 w-11 shrink-0 rounded-full bg-primary/15 ring-1 ring-primary/30 inline-flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </span>
                      {c.nome}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{c.cpf_cnpj || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{c.telefone || "—"}</TableCell>
                  <TableCell>{c.processos_count}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => navigate(`/clientes/${c.id}`)}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Se o cliente tem processos vinculados, a exclusão será bloqueada.</AlertDialogDescription>
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
