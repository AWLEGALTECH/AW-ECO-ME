import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { appConfig } from "@/config/app-config";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { logEvent } from "@/lib/audit";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

function FloatingInput({
  id, label, type = "text", value, onChange, required, minLength,
}: {
  id: string; label: string; type?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean; minLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const active = focused || value.length > 0;
  const isPassword = type === "password";
  const inputType = isPassword ? (showPw ? "text" : "password") : type;

  return (
    <div className="relative">
      <input
        id={id}
        type={inputType}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(
          "peer flex h-14 w-full rounded-xl border bg-transparent px-4 pt-5 pb-2 text-sm text-foreground outline-none transition-colors",
          focused
            ? "border-primary"
            : "border-border hover:border-muted-foreground/40"
        )}
      />
      <label
        htmlFor={id}
        className={cn(
          "pointer-events-none absolute left-4 transition-all duration-200 ease-out",
          active
            ? "top-2 text-[10px] font-medium tracking-wider uppercase text-primary"
            : "top-4 text-sm text-muted-foreground"
        )}
      >
        {label}
      </label>
      {isPassword && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPw(!showPw)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
    </div>
  );
}

export default function Auth() {
  useEffect(() => { document.title = appConfig.name; }, []);
  const [loading, setLoading] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      logEvent("login_failed", "auth", null, { email, reason: error.message });
    } else {
      logEvent("login", "auth", null, { email });
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name } },
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Cadastro enviado! Aguarde aprovação do administrador para acessar.", { duration: 8000 });
      logEvent("signup", "auth", null, { email, nome: name });
      setIsSignup(false);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <motion.div initial="hidden" animate="show" className="w-full max-w-sm">
        <motion.div custom={0} variants={fadeUp} className="mb-10 flex flex-col items-center text-center">
          <img src="/aw-logo.png" alt="AW" className="h-24 w-24 object-contain mb-4" />
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            AW <span className="text-primary">LEGALTECH</span>
          </h1>
        </motion.div>

        <motion.div custom={1} variants={fadeUp} className="mb-8 text-center">
          <h2 className="text-2xl font-medium tracking-tight mb-1">
            {isSignup ? "Criar conta" : "Bem-vindo"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isSignup ? "Preencha seus dados para solicitar acesso" : "Acesse sua conta para continuar"}
          </p>
        </motion.div>

        <form onSubmit={isSignup ? handleSignup : handleLogin} className="space-y-3">
          {isSignup && (
            <motion.div custom={2} variants={fadeUp}>
              <FloatingInput id="name" label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} required />
            </motion.div>
          )}
          <motion.div custom={isSignup ? 3 : 2} variants={fadeUp}>
            <FloatingInput id="email" label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </motion.div>
          <motion.div custom={isSignup ? 4 : 3} variants={fadeUp}>
            <FloatingInput id="password" label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </motion.div>

          {!isSignup && (
            <motion.div custom={4} variants={fadeUp} className="flex justify-end pt-1">
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Esqueceu a senha?
              </button>
            </motion.div>
          )}

          <motion.div custom={5} variants={fadeUp} className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : (
                <>
                  {isSignup ? "Criar conta" : "Entrar"}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </motion.div>
        </form>

        <motion.div custom={6} variants={fadeUp} className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isSignup ? "Já tem uma conta?" : "Não tem uma conta?"}
            <button type="button" onClick={() => setIsSignup(!isSignup)} className="ml-1 font-medium text-primary hover:text-primary/80 transition-colors">
              {isSignup ? "Entrar" : "Criar conta"}
            </button>
          </p>
        </motion.div>

        <motion.p custom={7} variants={fadeUp} className="mt-12 text-center text-[11px] text-muted-foreground/50">
          © {appConfig.copyrightYear} {appConfig.officeName}
        </motion.p>
      </motion.div>
    </div>
  );
}
