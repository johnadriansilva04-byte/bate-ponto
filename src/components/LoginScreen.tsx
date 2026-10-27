import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function LoginScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) toast.success("Conta criada! Abra seu e-mail e clique no link para confirmar.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg.includes("Invalid login") ? "E-mail ou senha incorretos." : msg || "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-2xl border-2 border-input bg-card px-5 py-4 text-xl outline-none focus:border-primary";
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <h1 className="font-display text-5xl font-extrabold text-primary">Meu Ponto</h1>
      <p className="mt-3 text-xl text-muted-foreground">Registre suas horas com um toque.</p>
      <form onSubmit={submit} className="mt-10 space-y-5">
        <label className="block">
          <span className="mb-2 block text-lg font-bold">E-mail</span>
          <input className={input} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-2 block text-lg font-bold">Senha</span>
          <input className={input} type="password" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button disabled={busy} className="btn-giant btn-start !min-h-20 !text-2xl">
          {mode === "in" ? "ENTRAR" : "CRIAR CONTA"}
        </button>
      </form>
      <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-8 text-lg font-bold text-primary underline underline-offset-4">
        {mode === "in" ? "Primeira vez? Criar conta" : "Já tenho conta. Entrar"}
      </button>
    </div>
  );
}
