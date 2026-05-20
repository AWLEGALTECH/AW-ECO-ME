import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { appConfig } from "@/config/app-config";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
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
    <div className="relative group">
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
          "peer flex h-14 w-full rounded-xl border bg-card/60 px-4 pt-5 pb-2 text-sm text-foreground outline-none transition-all duration-300 backdrop-blur-sm",
          focused
            ? "border-primary shadow-[0_0_20px_hsla(270,100%,50%,0.25)] ring-1 ring-primary/30"
            : "border-border hover:border-muted-foreground/30"
        )}
      />
      <label
        htmlFor={id}
        className={cn(
          "pointer-events-none absolute left-4 transition-all duration-200 ease-out",
          active
            ? "top-2 text-[10px] font-semibold tracking-wider uppercase text-primary"
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
    if (error) toast.error(error.message);
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
    else toast.success("Cadastro realizado! Aguarde aprovacao do administrador.");
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <div className="relative z-10 flex w-full flex-col justify-center px-8 py-12 lg:w-[480px] lg:px-16">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-primary/[0.04] blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 h-[400px] w-[400px] rounded-full bg-accent/[0.03] blur-[100px]" />
        </div>

        <motion.div initial="hidden" animate="show" className="relative z-10 mx-auto w-full max-w-sm">
          <motion.div custom={0} variants={fadeUp} className="mb-12">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-[0_0_20px_hsla(270,100%,62%,0.4)]">
                <span className="text-lg font-black text-primary-foreground tracking-tighter">AW</span>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground" style={{fontFamily:'Lato,Inter,sans-serif'}}>
                  AW <span className="text-primary">LEGALTECH</span>
                </h1>
              </div>
            </div>
          </motion.div>

          <motion.div custom={1} variants={fadeUp} className="mb-8">
            <h2 style={{fontFamily:'EB Garamond,serif', fontSize:'1.9rem', fontWeight:600, lineHeight:1.2, marginBottom:'0.5rem', color:'inherit'}}>
              {isSignup ? "Criar Conta" : "Bem-vindo de volta"}
            </h2>
            <p style={{fontFamily:'Lato,Inter,sans-serif'}} className="text-sm text-muted-foreground">
              {isSignup ? "Preencha seus dados para solicitar acesso" : "Acesse sua plataforma de gestao juridica"}
            </p>
          </motion.div>

          <form onSubmit={isSignup ? handleSignup : handleLogin} className="space-y-4">
            {isSignup && (
              <motion.div custom={2} variants={fadeUp}>
                <FloatingInput id="name" label="Nome Completo" value={name} onChange={(e) => setName(e.target.value)} required />
              </motion.div>
            )}
            <motion.div custom={isSignup ? 3 : 2} variants={fadeUp}>
              <FloatingInput id="email" label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </motion.div>
            <motion.div custom={isSignup ? 4 : 3} variants={fadeUp}>
              <FloatingInput id="password" label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </motion.div>

            {!isSignup && (
              <motion.div custom={4} variants={fadeUp} className="flex justify-end">
                <button type="button" className="text-xs text-primary hover:text-primary/80 transition-colors">
                  Esqueceu a senha?
                </button>
              </motion.div>
            )}

            <motion.div custom={5} variants={fadeUp}>
              <button
                type="submit"
                disabled={loading}
                className="group relative flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-all duration-300 hover:brightness-110 hover:shadow-[0_0_30px_hsla(270,100%,50%,0.4)] disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                ) : (
                  <>
                    {isSignup ? "Criar Conta" : "Entrar"}
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </motion.div>
          </form>

          <motion.div custom={6} variants={fadeUp} className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              {isSignup ? "Ja tem uma conta?" : "Nao tem uma conta?"}
              <button type="button" onClick={() => setIsSignup(!isSignup)} className="ml-1 font-semibold text-primary hover:text-primary/80 transition-colors">
                {isSignup ? "Entrar" : "Criar conta"}
              </button>
            </p>
          </motion.div>

          <motion.div custom={7} variants={fadeUp} className="mt-16">
            <p className="text-[11px] text-muted-foreground/50 text-center">© {appConfig.copyrightYear} {appConfig.officeName} · Todos os direitos reservados</p>
          </motion.div>
        </motion.div>
      </div>

      <div className="relative hidden flex-1 overflow-hidden lg:block">
        <img
          src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80&auto=format&fit=crop"
          alt="Modern law office"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-primary/20" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-12 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent"></span>
            <span style={{fontFamily:'Lato,sans-serif'}} className="text-xs font-medium text-white/80 tracking-widest uppercase">Powered by AW Intelligence</span>
          </div>
          <h1 style={{fontFamily:'EB Garamond,serif', fontSize:'3.5rem', fontWeight:600, lineHeight:1.15, color:'white'}}>
            Inteligencia Juridica<br />
            <span style={{background:'linear-gradient(135deg, hsl(270,100%,75%), hsl(190,100%,65%))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Unificada.</span>
          </h1>
          <p style={{fontFamily:'Lato,sans-serif'}} className="mt-6 max-w-md text-base leading-relaxed text-white/70">
            A tradicao e excelencia de Martins Pontes Advocacia, potencializadas pela tecnologia do AW ECO.
          </p>
        </div>
      </div>
    </div>
  );
}