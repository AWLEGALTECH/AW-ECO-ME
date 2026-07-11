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
import { LogOut, Upload, User, Save, Palette, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { logEvent } from "@/lib/audit";

export function UserPanel() {
  const { user, profile, signOut } = useAuth();
  const { palette, setPalette } = useTheme();
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
    await logEvent("logout", "auth");
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

        {/* Theme palette */}
        <div className="py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tema do AW ECO</h4>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPalette("default")}
              className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                palette === "default"
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "border-border/60 hover:border-primary/40 bg-card/40"
              }`}
              title="Paleta padrão (roxo)"
            >
              {palette === "default" && (
                <Check className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-primary" />
              )}
              <div className="h-6 w-full rounded-md mb-1.5" style={{ background: "linear-gradient(135deg, hsl(270 100% 62%), hsl(280 80% 55%))" }} />
              <span className="text-[11px] font-medium">Padrão</span>
            </button>

            <button
              onClick={() => setPalette("midnight-blue")}
              className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                palette === "midnight-blue"
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "border-border/60 hover:border-primary/40 bg-card/40"
              }`}
              title="Midnight Blue — azul meianoite"
            >
              {palette === "midnight-blue" && (
                <Check className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-primary" />
              )}
              <div className="h-6 w-full rounded-md mb-1.5" style={{ background: "linear-gradient(135deg, hsl(222 85% 55%), hsl(232 75% 38%))" }} />
              <span className="text-[11px] font-medium">Midnight Blue</span>
            </button>

            <button
              onClick={() => setPalette("vermelho")}
              className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                palette === "vermelho"
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "border-border/60 hover:border-primary/40 bg-card/40"
              }`}
              title="Vermelho — vermelho vivo"
            >
              {palette === "vermelho" && (
                <Check className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-primary" />
              )}
              <div className="h-6 w-full rounded-md mb-1.5" style={{ background: "linear-gradient(135deg, hsl(0 85% 60%), hsl(352 75% 42%))" }} />
              <span className="text-[11px] font-medium">Vermelho</span>
            </button>

            <button
              onClick={() => setPalette("space-gray")}
              className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                palette === "space-gray"
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "border-border/60 hover:border-primary/40 bg-card/40"
              }`}
              title="Space Gray — prateado surfista"
            >
              {palette === "space-gray" && (
                <Check className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-primary" />
              )}
              <div className="h-6 w-full rounded-md mb-1.5" style={{ background: "linear-gradient(135deg, hsl(215 18% 72%), hsl(215 12% 45%))" }} />
              <span className="text-[11px] font-medium">Space Gray</span>
            </button>

            <button
              onClick={() => setPalette("sei")}
              className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                palette === "sei"
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "border-border/60 hover:border-primary/40 bg-card/40"
              }`}
              title="SEI — paleta do Sistema Eletrônico de Informações"
            >
              {palette === "sei" && (
                <Check className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-primary" />
              )}
              <div className="h-6 w-full rounded-md mb-1.5 overflow-hidden flex">
                <div style={{ width: "30%", background: "white", borderRight: "1px solid hsl(200 15% 88%)" }} />
                <div style={{ flex: 1, background: "hsl(199 75% 41%)" }} />
              </div>
              <span className="text-[11px] font-medium">SEI</span>
            </button>
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