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
import { LogOut, Upload, User, Save, Palette, Check, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { Paleta } from "@/lib/preferencias";
import { toast } from "sonner";
import { logEvent } from "@/lib/audit";

const MOLA_DO_TEMA = { type: "spring", stiffness: 380, damping: 34 } as const;

const faixa = (fundo: string) => (
  <div className="h-6 w-full rounded-md mb-1.5" style={{ background: fundo }} />
);

/* Os temas do seletor. A amostra é o próprio tema em miniatura: a cor que ele
   pinta, e não um nome para decorar. */
const TEMAS: { id: Paleta; nome: string; dica: string; amostra: JSX.Element }[] = [
  { id: "default", nome: "Padrão", dica: "Paleta padrão (roxo)",
    amostra: faixa("linear-gradient(135deg, hsl(270 100% 62%), hsl(280 80% 55%))") },
  { id: "midnight-blue", nome: "Midnight Blue", dica: "Midnight Blue: azul meianoite",
    amostra: faixa("linear-gradient(135deg, hsl(222 85% 55%), hsl(232 75% 38%))") },
  { id: "vermelho", nome: "Flame Red", dica: "Flame Red: vermelho vivo",
    amostra: faixa("linear-gradient(135deg, hsl(0 85% 60%), hsl(352 75% 42%))") },
  { id: "space-gray", nome: "Space Gray", dica: "Space Gray: prateado surfista",
    amostra: faixa("linear-gradient(135deg, hsl(215 18% 72%), hsl(215 12% 45%))") },
  { id: "sei", nome: "SEI", dica: "SEI: paleta do Sistema Eletrônico de Informações",
    amostra: (
      <div className="h-6 w-full rounded-md mb-1.5 overflow-hidden flex">
        <div style={{ width: "30%", background: "white", borderRight: "1px solid hsl(200 15% 88%)" }} />
        <div style={{ flex: 1, background: "hsl(199 75% 41%)" }} />
      </div>
    ) },
  /* Papel, grafite e tinta: fundo branco, um traço cinza e o preto da ação. */
  { id: "branco", nome: "Off-White", dica: "Off-White: claro, chapado, em cinza e preto",
    amostra: (
      <div className="h-6 w-full rounded-md mb-1.5 overflow-hidden flex items-center gap-1 px-1.5"
        style={{ background: "#ffffff", border: "1px solid #e3e3e3" }}>
        <div className="h-2 flex-1 rounded-full" style={{ background: "#e5e5e5" }} />
        <div className="h-3 w-5 rounded" style={{ background: "#171717" }} />
      </div>
    ) },
];

export function UserPanel() {
  const { user, profile, signOut } = useAuth();
  const { palette, setPalette } = useTheme();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  const [uploading, setUploading] = useState(false);
  const [removendo, setRemovendo] = useState(false);
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

  // Voltar a ficar sem foto. Limpa a coluna E apaga os arquivos do bucket: só
  // limpar a coluna deixaria a imagem hospedada e pública para sempre, o que
  // não é o que "remover minha foto" quer dizer.
  //
  // Apaga por listagem porque a extensão faz parte do caminho (avatar.jpg,
  // avatar.png…) — quem trocou de formato tem mais de um arquivo lá.
  const handleRemoverFoto = async () => {
    if (!user) return;
    setRemovendo(true);
    const { data: arquivos } = await supabase.storage.from("avatars").list(user.id);
    if (arquivos?.length) {
      await supabase.storage.from("avatars").remove(arquivos.map((a) => `${user.id}/${a.name}`));
    }
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    setRemovendo(false);
    if (error) { toast.error("Erro ao remover a foto"); return; }
    setAvatarUrl(null);
    toast.success("Foto removida — voltou para as iniciais");
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
          <Avatar className="h-10 w-10 md:h-8 md:w-8 cursor-pointer border-2 border-foreground/25">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="bg-foreground/15 text-foreground text-sm md:text-xs">{initials}</AvatarFallback>
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || removendo}>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Enviando..." : avatarUrl ? "Trocar foto" : "Adicionar foto"}
            </Button>
            {/* Só aparece com foto: botão de remover sem nada pra remover é
                promessa quebrada. Trocar era o único caminho, e quem quisesse
                voltar ao monograma ficava sem saída. */}
            {avatarUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoverFoto}
                disabled={uploading || removendo}
                className="text-muted-foreground hover:text-red-400"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                {removendo ? "Removendo…" : "Remover"}
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* Theme palette */}
        <div className="py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tema do AW ECO</h4>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {TEMAS.map((t) => {
              const escolhido = palette === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setPalette(t.id)}
                  className="relative rounded-xl border-2 border-border/60 hover:border-primary/40 bg-card/40 p-3 text-left transition-colors"
                  title={t.dica}
                >
                  {/* UM SÓ contorno de escolhido, que desliza de um cartão para
                      o outro, em vez de seis que acendem e apagam */}
                  {escolhido && (
                    <motion.span
                      layoutId="tema-escolhido"
                      transition={MOLA_DO_TEMA}
                      className="pointer-events-none absolute -inset-[2px] rounded-xl border-2 border-primary bg-primary/10 ring-2 ring-primary/20"
                    />
                  )}
                  <AnimatePresence initial={false}>
                    {escolhido && (
                      <motion.span
                        key="marca"
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute top-1.5 right-1.5"
                      >
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <div className="relative">
                    {t.amostra}
                    <span className="text-[11px] font-medium">{t.nome}</span>
                  </div>
                </button>
              );
            })}
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