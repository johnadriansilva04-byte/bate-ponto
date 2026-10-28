import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, CalendarDays } from "lucide-react";
import { buildLabel } from "@/lib/version";

export function AppShell({ children }: { children: ReactNode }) {
  const tab =
    "flex flex-1 flex-col items-center gap-1 rounded-2xl py-3 text-xl font-bold text-muted-foreground transition-colors";
  return (
    <div className="app-shell mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-28 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <span className="font-display text-2xl font-extrabold text-primary">Meu Ponto</span>
      </header>
      <main className="flex flex-1 flex-col justify-center">{children}</main>
      {/* Marco temporal do codigo: fica visivel e nao e apagado por engano. */}
      <p className="no-print mt-6 text-center text-xs text-muted-foreground">{buildLabel}</p>
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t bg-card shadow-soft">
        <div className="mx-auto flex max-w-2xl gap-2 p-2">
          <Link
            to="/"
            className={tab}
            activeProps={{ className: "bg-accent text-accent-foreground" }}
            activeOptions={{ exact: true }}
          >
            <Clock className="h-8 w-8" /> BATER PONTO
          </Link>
          <Link
            to="/historico"
            className={tab}
            activeProps={{ className: "bg-accent text-accent-foreground" }}
          >
            <CalendarDays className="h-8 w-8" /> HISTÓRICO
          </Link>
        </div>
      </nav>
    </div>
  );
}
