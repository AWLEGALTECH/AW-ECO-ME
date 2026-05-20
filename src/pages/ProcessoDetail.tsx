import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { ArrowLeft, Save, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessoForm {
  id?: string;
  numero_processo: string;
  cliente_id: string;
  materia: string;
  data_ultimo_andamento: string;
  prazo_processual: string;
  fase_processual: string;
  tipo_pendencia: string;
  status_tarefa: string;
  vara_juizo_origem: string;
  observacoes: string;
  valor_causa: string;
  comarca_uf: string;
  parceiro: string;
}

interface ClienteOption { id: string; nome: string }

const EMPTY: ProcessoForm = {
  numero_processo: "",
  cliente_id: "",
  materia: "",
  data_ultimo_andamento: "",
  prazo_processual: "",
  fase_processual: "",
  tipo_pendencia: "",
  status_tarefa: "",
  vara_juizo_origem: "",
  observacoes: "",
  valor_causa: "",
  comarca_uf: "",
  parceiro: "",
};

export default function ProcessoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "novo";

  const [form, setForm] = useState<ProcessoForm>(EMPTY);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const loadClientes = useCallback(async () => {
    const { data } = await supabase.from("clientes").select("id, nome").order("nome");
    if (data) setClientes(data);
  }, []);

  const loadProcesso = useCallback(async () => {
    if (isNew || !id) return;
    const { data } = await supabase.from("processos").select("*").eq("id", id).single();
    if (data) {
      setForm({
        id: data.id,
        numero_processo: data.numero_processo ?? "",
        cliente_id: data.cliente_id,
        materia: data.materia ?? "",
        data_ultimo_andamento: data.data_ultimo_andamento ?? "",
        prazo_processual: data.prazo_processual ?? "",
        fase_processual: data.fase_processual ?? "",
        tipo_pendencia: data.tipo_pendencia ?? "",
        status_tarefa: data.status_tarefa ?? "",
        vara_juizo_origem: data.vara_juizo_origem ?? "",
        observacoes: data.observacoes ?? "",
        valor_causa: data.valor_causa != null ? String(data.valor_causa) : "",
        comarca_uf: data.comarca_uf ?? "",
        parceiro: data.parceiro ?? "",
      });
    }
    setLoading(false);
  }, [id, isNew]);

  useEffect(() => {
    document.title = isNew ? "Novo Processo — AW ECO ME" : "Processo — AW ECO ME";
    loadClientes();
    loadProcesso();
  }, [loadClientes, loadProcesso, isNew]);

  const handleSave = async () => {
    if (!form.numero_processo.trim()) { toast.error("Número do processo é obrigatório"); return; }
    if (!form.cliente_id) { toast.error("Cliente é obrigatório"); return; }
    setSaving(true);
    const payload = {
      numero_processo: form.numero_processo.trim(),
      cliente_id: form.cliente_id,
      materia: form.materia.trim() || null,
      data_ultimo_andamento: form.data_ultimo_andamento || null,
      prazo_processual: form.prazo_processual || null,
      fase_processual: form.fase_processual.trim() || null,
      tipo_pendencia: form.tipo_pendencia.trim() || null,
      status_tarefa: form.status_tarefa.trim() || null,
      vara_juizo_origem: form.vara_juizo_origem.trim() || null,
      observacoes: form.observacoes.trim() || null,
      valor_causa: form.valor_causa ? Number(form.valor_causa) : null,
      comarca_uf: form.comarca_uf.trim() || null,
      parceiro: form.parceiro.trim() || null,
    };

    let error: unknown;
    if (isNew) {
      const res = await supabase.from("processos").insert(payload).select("id").single();
      error = res.error;
      if (!error && res.data) { setSaving(false); toast.success("Processo criado"); navigate(`/processos/${res.data.id}`); return; }
    } else {
      const res = await supabase.from("processos").update(payload).eq("id", id!);
      error = res.error;
    }
    setSaving(false);
    if (error) {
      const code = (error as { code?: string }).code;
      toast.error(code === "23505" ? "Número de processo já cadastrado" : "Erro ao salvar");
      return;
    }
    toast.success("Processo atualizado");
  };

  if (loading) return <div className="text-center text-muted-foreground py-8">Carregando...</div>;

  const clienteSelecionado = clientes.find((c) => c.id === form.cliente_id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" onClick={() => navigate("/processos")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />{saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-base">
            {isNew ? "Novo Processo" : form.numero_processo}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nº do Processo *</Label>
            <Input value={form.numero_processo} onChange={(e) => setForm({ ...form, numero_processo: e.target.value })} placeholder="0000000-00.0000.0.00.0000" />
          </div>

          <div>
            <Label>Cliente *</Label>
            <Popover open={clientePopoverOpen} onOpenChange={setClientePopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {clienteSelecionado ? clienteSelecionado.nome : "Selecionar cliente..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0">
                <Command>
                  <CommandInput placeholder="Buscar cliente..." />
                  <CommandList>
                    <CommandEmpty>Nenhum cliente.</CommandEmpty>
                    <CommandGroup>
                      {clientes.map((c) => (
                        <CommandItem key={c.id} value={c.nome} onSelect={() => { setForm({ ...form, cliente_id: c.id }); setClientePopoverOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", form.cliente_id === c.id ? "opacity-100" : "opacity-0")} />
                          {c.nome}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {clienteSelecionado && (
              <Link to={`/clientes/${clienteSelecionado.id}`} className="text-xs text-muted-foreground hover:underline mt-1 inline-block">
                Ver cliente →
              </Link>
            )}
          </div>

          <div>
            <Label>Matéria</Label>
            <Input value={form.materia} onChange={(e) => setForm({ ...form, materia: e.target.value })} placeholder="RCC, CESTA, RMC..." />
          </div>

          <div>
            <Label>Fase Processual</Label>
            <Input value={form.fase_processual} onChange={(e) => setForm({ ...form, fase_processual: e.target.value })} placeholder="AG. SENTENÇA, ARQUIVADO..." />
          </div>

          <div>
            <Label>Data Último Andamento</Label>
            <Input type="date" value={form.data_ultimo_andamento} onChange={(e) => setForm({ ...form, data_ultimo_andamento: e.target.value })} />
          </div>

          <div>
            <Label>Prazo Processual</Label>
            <Input type="date" value={form.prazo_processual} onChange={(e) => setForm({ ...form, prazo_processual: e.target.value })} />
          </div>

          <div>
            <Label>Tipo de Pendência</Label>
            <Input value={form.tipo_pendencia} onChange={(e) => setForm({ ...form, tipo_pendencia: e.target.value })} />
          </div>

          <div>
            <Label>Status da Tarefa</Label>
            <Select value={form.status_tarefa || "__none__"} onValueChange={(v) => setForm({ ...form, status_tarefa: v === "__none__" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                <SelectItem value="EM CONFECÇÃO">EM CONFECÇÃO</SelectItem>
                <SelectItem value="CONCLUÍDO">CONCLUÍDO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Vara/Juízo de Origem</Label>
            <Input value={form.vara_juizo_origem} onChange={(e) => setForm({ ...form, vara_juizo_origem: e.target.value })} />
          </div>

          <div>
            <Label>Comarca/UF</Label>
            <Input value={form.comarca_uf} onChange={(e) => setForm({ ...form, comarca_uf: e.target.value })} placeholder="MANAUS/AM" />
          </div>

          <div>
            <Label>Valor da Causa (R$)</Label>
            <Input type="number" step="0.01" value={form.valor_causa} onChange={(e) => setForm({ ...form, valor_causa: e.target.value })} />
          </div>

          <div>
            <Label>Parceiro</Label>
            <Input value={form.parceiro} onChange={(e) => setForm({ ...form, parceiro: e.target.value })} />
          </div>

          <div className="md:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
