import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, CalendarDays } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  const tab =
    "flex flex-1 flex-col items-center gap-1 rounded-2xl py-3 text-lg font-bold text-muted-foreground transition-colors";
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-32 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <span className="font-display text-2xl font-extrabold text-primary">Meu Ponto</span>
      </header>
      <main className="flex-1">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card shadow-soft">
        <div className="mx-auto flex max-w-2xl gap-2 p-2">
          <Link
            to="/"
            className={tab}
            activeProps={{ className: "bg-accent text-accent-foreground" }}
            activeOptions={{ exact: true }}
          >
            <Clock className="h-7 w-7" /> BATER PONTO
          </Link>
          <Link
            to="/historico"
            className={tab}
            activeProps={{ className: "bg-accent text-accent-foreground" }}
          >
            <CalendarDays className="h-7 w-7" /> HISTÓRICO
          </Link>
        </div>
      </nav>
    </div>
  );
}
