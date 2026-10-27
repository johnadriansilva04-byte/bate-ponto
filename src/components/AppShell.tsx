import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Clock, CalendarDays, LogOut } from "lucide-react";
import { LoginScreen } from "./LoginScreen";

export function AppShell({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="min-h-screen" />;
  if (!session) return <LoginScreen />;

  const tab =
    "flex flex-1 flex-col items-center gap-1 rounded-2xl py-3 text-lg font-bold text-muted-foreground transition-colors";
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-32 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <span className="font-display text-2xl font-extrabold text-primary">Meu Ponto</span>
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-base text-muted-foreground hover:bg-muted"
        >
          <LogOut className="h-5 w-5" /> Sair
        </button>
      </header>
      <main className="flex-1">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card shadow-soft">
        <div className="mx-auto flex max-w-2xl gap-2 p-2">
          <Link to="/" className={tab} activeProps={{ className: "bg-accent text-accent-foreground" }} activeOptions={{ exact: true }}>
            <Clock className="h-7 w-7" /> BATER PONTO
          </Link>
          <Link to="/historico" className={tab} activeProps={{ className: "bg-accent text-accent-foreground" }}>
            <CalendarDays className="h-7 w-7" /> HISTÓRICO
          </Link>
        </div>
      </nav>
    </div>
  );
}
