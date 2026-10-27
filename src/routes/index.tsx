import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { endSession, fetchOpenSession, fetchSessionsBetween, startSession } from "@/lib/sessions-api";
import { TZ, dayKey, fmtDate, fmtTime, formatClock, formatDuration, localMidnight, tzParts, todaySeconds } from "@/lib/hours";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bater ponto — Meu Ponto" },
      { name: "description", content: "Toque para iniciar e finalizar o trabalho. As horas são somadas sozinhas." },
      { property: "og:title", content: "Bater ponto — Meu Ponto" },
      { property: "og:description", content: "Toque para iniciar e finalizar o trabalho. As horas são somadas sozinhas." },
    ],
  }),
  component: () => (
    <AppShell>
      <Punch />
    </AppShell>
  ),
});

const longDate = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const clockFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" });

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Punch() {
  const now = useNow();
  const qc = useQueryClient();
  const p = tzParts(now);
  const from = new Date(localMidnight(p.y, p.m, p.d)).toISOString();
  const to = new Date(localMidnight(p.y, p.m, p.d) + 86400000).toISOString();
  const today = dayKey(now);

  const open = useQuery({ queryKey: ["open"], queryFn: fetchOpenSession });
  const day = useQuery({ queryKey: ["day", today], queryFn: () => fetchSessionsBetween(from, to) });

  const refresh = () => qc.invalidateQueries();
  const start = useMutation({ mutationFn: startSession, onSuccess: () => { toast.success("Trabalho iniciado!"); refresh(); }, onError: () => toast.error("Não foi possível registrar. Tente de novo.") });
  const stop = useMutation({ mutationFn: (id: string) => endSession(id), onSuccess: () => { toast.success("Trabalho finalizado!"); refresh(); }, onError: () => toast.error("Não foi possível registrar. Tente de novo.") });

  const running = open.data;
  const elapsed = running ? (now.getTime() - new Date(running.started_at).getTime()) / 1000 : 0;
  const sessions = [...(day.data ?? [])];
  if (running && !sessions.some((s) => s.id === running.id)) sessions.push(running);
  const totalToday = todaySeconds(sessions, now);
  const loading = open.isLoading;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-card p-6 text-center shadow-soft">
        <p className="text-xl capitalize text-muted-foreground">{longDate.format(now)}</p>
        <p className="font-display text-6xl font-extrabold tabular-nums">{clockFmt.format(now)}</p>
      </section>

      {loading ? (
        <div className="h-36 animate-pulse rounded-3xl bg-muted" />
      ) : running ? (
        <section className="space-y-5">
          <div className="rounded-3xl border-2 border-primary bg-accent p-6 text-center">
            <p className="flex items-center justify-center gap-2 text-lg font-bold text-accent-foreground">
              <span className="pulse-dot inline-block h-3 w-3 rounded-full bg-primary" /> Trabalhando desde {fmtTime(running.started_at)}
              {dayKey(new Date(running.started_at)) !== today && ` de ${fmtDate(running.started_at)}`}
            </p>
            <p className="mt-2 font-display text-6xl font-extrabold tabular-nums text-accent-foreground">{formatClock(elapsed)}</p>
            {elapsed > 16 * 3600 && (
              <p className="mt-3 rounded-xl bg-warning p-3 text-base font-bold text-warning-foreground">
                Esta sessão está aberta há muito tempo. Se esqueceu de finalizar, corrija no Histórico.
              </p>
            )}
          </div>
          <button className="btn-giant btn-stop" disabled={stop.isPending} onClick={() => stop.mutate(running.id)}>
            FINALIZAR TRABALHO
          </button>
        </section>
      ) : (
        <button className="btn-giant btn-start" disabled={start.isPending} onClick={() => start.mutate()}>
          INICIAR TRABALHO
        </button>
      )}

      <section className="flex items-center justify-between rounded-3xl bg-secondary p-6">
        <span className="text-xl font-bold text-secondary-foreground">Total de hoje</span>
        <span className="font-display text-4xl font-extrabold text-primary">{formatDuration(totalToday)}</span>
      </section>
    </div>
  );
}
