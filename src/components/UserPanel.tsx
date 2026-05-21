import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { LogOut, Upload, User, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const ACCENT_COLORS = [
  { key: "blue" as const, label: "Azul", hsl: "210 70% 50%" },
  { key: "green" as const, label: "Verde", hsl: "142 71% 45%" },
  { key: "red" as const, label: "Vermelho", hsl: "0 72% 51%" },
  { key: "purple" as const, label: "Roxo", hsl: "270 60% 50%" },
  { key: "gold" as const, label: "Dourado", hsl: "38 92% 50%" },
];

export function UserPanel() {
  const { user, profile, signOut } = useAuth();
  const { mode, color, setMode, setColor } = useTheme();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Sync avatar from profile on mount
  useEffect(() => {
    if (profile?.avatar_url && !avatarUrl) {
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile?.avatar_url]);

  // Load avatar on open
  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && user) {
      const { data } = await supabase.from("profiles").select("avatar_url, nome").eq("id", user.id).single();
      if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      setFullName(data?.nome || "");
      setEditingName(false);
    }
  };

  const handleSaveName = async () => {
    if (!user) return;
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ nome: fullName }).eq("id", user.id);
    if (error) {
      toast.error("Erro ao atualizar nome");
    } else {
      toast.success("Nome atualizado");
      setEditingName(false);
      // Reload auth profile to reflect everywhere
      window.location.reload();
    }
    setSavingName(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error("Erro ao fazer upload");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = urlData.publicUrl + `?t=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setAvatarUrl(url);
    setUploading(false);
    toast.success("Foto atualizada");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const initials = (profile?.nome || user?.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        <button className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity">
          <Avatar className="h-8 w-8 cursor-pointer border-2 border-primary-foreground/30">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground text-xs">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </SheetTrigger>
      <SheetContent className="w-80 flex flex-col">
        <SheetHeader>
          <SheetTitle className="sr-only">Perfil do Usuário</SheetTitle>
        </SheetHeader>

        {/* Avatar & Info */}
        <div className="flex flex-col items-center gap-3 py-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="text-center w-full space-y-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="text-center text-sm"
                  placeholder="Nome completo"
                />
                <Button size="icon" variant="ghost" onClick={handleSaveName} disabled={savingName}>
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <p
                className="font-display font-medium cursor-pointer hover:underline"
                onClick={() => setEditingName(true)}
                title="Clique para editar"
              >
                {fullName || profile?.nome || "Usuário"}
              </p>
            )}
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Enviando..." : "Alterar Foto"}
          </Button>
        </div>

        <Separator />

        {/* Theme section */}
        <div className="py-4 space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Aparência</h4>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Modo Escuro</span>
            <Switch checked={mode === "dark"} onCheckedChange={(v) => setMode(v ? "dark" : "light")} />
          </div>

          <div>
            <span className="text-sm font-medium block mb-2">Cor de Destaque</span>
            <div className="flex gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setColor(c.key)}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${
                    color === c.key ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: `hsl(${c.hsl})` }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        </div>

        <Separator />

        {/* Navigation */}
        <div className="py-4 space-y-1">
          <Button variant="ghost" className="w-full justify-start" onClick={() => { setOpen(false); navigate("/dashboard"); }}>
            <User className="h-4 w-4 mr-2" />Meu Perfil
          </Button>
        </div>

        <div className="mt-auto pb-4">
          <Button variant="outline" className="w-full" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />Sair
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}