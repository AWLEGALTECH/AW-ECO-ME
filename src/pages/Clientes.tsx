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
import { Plus, Search, Eye, Trash2, User, FolderOpen, ExternalLink, Loader2, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  processos_count?: number;
}

type Stage = "form" | "drive";

export default function Clientes() {
  useEffect(() => { document.title = "Clientes — AW ECO ME"; }, []);
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", cpf_cnpj: "", telefone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [createdName, setCreatedName] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const resetDialog = () => {
    setForm({ nome: "", cpf_cnpj: "", telefone: "", email: "" });
    setStage("form");
    setCreatedName("");
    setCreatedId(null);
    setDriveUrl(null);
    setDriveError(null);
    setCreatingFolder(false);
  };

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
    const nome = form.nome.trim();
    const { data: inserted, error } = await supabase.from("clientes").insert({
      nome,
      cpf_cnpj: form.cpf_cnpj.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
    }).select("id").single();
    setSaving(false);
    if (error || !inserted) {
      toast.error(error?.code === "23505" ? "Cliente já existe" : "Erro ao salvar");
      return;
    }
    toast.success("Cliente adicionado");
    setCreatedName(nome);
    setCreatedId(inserted.id);
    setStage("drive");
    fetchAll();

    // Cria pasta no Drive em background — o stage 2 mostra spinner ate concluir
    setCreatingFolder(true);
    const { data: fnData, error: fnErr } = await supabase.functions.invoke(
      "create-cliente-drive-folder",
      { body: { cliente_id: inserted.id } },
    );
    setCreatingFolder(false);
    if (fnErr || !fnData?.ok) {
      const msg = (fnData as any)?.error || fnErr?.message || "Falha desconhecida";
      setDriveError(msg);
      return;
    }
    setDriveUrl((fnData as any).folder_url);
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
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDialog(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader className="items-center text-center space-y-3">
              <div className="h-16 w-16 rounded-full bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
                {stage === "form" ? (
                  <User className="h-7 w-7 text-primary" />
                ) : (
                  <Check className="h-7 w-7 text-primary" />
                )}
              </div>
              <DialogTitle>
                {stage === "form" ? "Novo Cliente" : createdName}
              </DialogTitle>
              {stage === "drive" && (
                <p className="text-xs text-muted-foreground -mt-1">
                  Cliente criado. Agora abra a pasta no Drive pra subir os documentos.
                </p>
              )}
            </DialogHeader>

            {stage === "form" ? (
              <>
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
              </>
            ) : (
              <>
                <div className="py-3 space-y-3">
                  {creatingFolder ? (
                    <div className="rounded-xl border border-border bg-card/40 p-4 flex items-center gap-3">
                      <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Criando pasta no Drive…</p>
                        <p className="text-[11px] text-muted-foreground">Isso leva alguns segundos.</p>
                      </div>
                    </div>
                  ) : driveError ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-1">
                      <p className="text-sm font-medium text-destructive">Não foi possível criar a pasta</p>
                      <p className="text-[11px] text-muted-foreground break-all">{driveError}</p>
                      <p className="text-[11px] text-muted-foreground italic">
                        Você pode tentar de novo abrindo o cliente depois.
                      </p>
                    </div>
                  ) : driveUrl ? (
                    <a
                      href={driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl border border-primary/40 bg-primary/10 p-4 hover:bg-primary/15 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                          <FolderOpen className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">Abrir pasta no Drive</p>
                          <p className="text-[11px] text-muted-foreground">Faça o upload dos documentos do cliente</p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-primary opacity-70 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </a>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setOpen(false); }}>Fechar</Button>
                  {createdId && (
                    <Button onClick={() => { setOpen(false); navigate(`/clientes/${createdId}`); }}>
                      Ir pro perfil
                    </Button>
                  )}
                </DialogFooter>
              </>
            )}
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
