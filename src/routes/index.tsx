import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Info, WifiOff, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

  const [askStop, setAskStop] = useState(false);
  const refresh = () => qc.invalidateQueries();
  const start = useMutation({ mutationFn: startSession, onSuccess: () => { toast.success("Entrada registrada! Bom trabalho."); refresh(); }, onError: () => toast.error("Não deu para registrar agora. Confira a internet e tente de novo.") });
  const stop = useMutation({ mutationFn: (id: string) => endSession(id), onSuccess: () => { toast.success("Saída registrada! Suas horas entraram na soma."); refresh(); }, onError: () => toast.error("Não deu para registrar agora. Confira a internet e tente de novo.") });

  const running = open.data;
  const elapsed = running ? (now.getTime() - new Date(running.started_at).getTime()) / 1000 : 0;
  const sessions = [...(day.data ?? [])];
  if (running && !sessions.some((s) => s.id === running.id)) sessions.push(running);
  const totalToday = todaySeconds(sessions, now);
  const closedToday = sessions.filter((s) => s.ended_at).length;
  const loading = open.isLoading;
  const failed = open.isError || day.isError;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-card p-6 text-center shadow-soft">
        <p className="text-xl capitalize text-muted-foreground" suppressHydrationWarning>{longDate.format(now)}</p>
        <p className="font-display text-6xl font-extrabold tabular-nums" suppressHydrationWarning>{clockFmt.format(now)}</p>
      </section>

      {loading ? (
        <div className="h-36 animate-pulse rounded-3xl bg-muted" />
      ) : failed ? (
        <section className="space-y-4 rounded-3xl bg-warning p-6 text-warning-foreground">
          <p className="flex items-center gap-2 text-lg font-bold">
            <WifiOff className="h-6 w-6" /> Sem conexão com seus horários
          </p>
          <p className="text-base">
            Não conseguimos carregar seus registros agora. Confira se o celular está com internet e tente de novo.
            Seus horários já salvos não foram perdidos.
          </p>
          <button
            onClick={() => refresh()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-card px-4 py-4 text-lg font-bold text-foreground shadow-sm"
          >
            <RefreshCw className="h-5 w-5" /> Tentar de novo
          </button>
        </section>
      ) : running ? (
        <section className="space-y-5">
          <div className="rounded-3xl border-2 border-primary bg-accent p-6 text-center">
            <p className="flex items-center justify-center gap-2 text-lg font-bold text-accent-foreground">
              <span className="pulse-dot inline-block h-3 w-3 rounded-full bg-primary" /> Você começou às {fmtTime(running.started_at)}
              {dayKey(new Date(running.started_at)) !== today && ` de ${fmtDate(running.started_at)}`}
            </p>
            <p className="mt-2 font-display text-6xl font-extrabold tabular-nums text-accent-foreground">{formatClock(elapsed)}</p>
            <p className="mt-2 text-base font-bold text-accent-foreground">tempo trabalhado nesta sessão</p>
            {elapsed > 16 * 3600 && (
              <p className="mt-3 rounded-xl bg-warning p-3 text-base font-bold text-warning-foreground">
                Esta sessão está aberta há muito tempo. Se você esqueceu de finalizar, pode corrigir na aba Histórico.
              </p>
            )}
          </div>
          <p className="flex items-start gap-2 rounded-2xl bg-secondary p-4 text-base text-secondary-foreground">
            <Info className="mt-0.5 h-5 w-5 shrink-0" />
            Quando terminar de trabalhar, toque no botão vermelho abaixo. O horário de saída será registrado sozinho.
          </p>
          <button className="btn-giant btn-stop" disabled={stop.isPending} onClick={() => setAskStop(true)}>
            {stop.isPending ? "REGISTRANDO..." : "FINALIZAR TRABALHO"}
          </button>
        </section>
      ) : (
        <section className="space-y-5">
          <p className="flex items-start gap-2 rounded-2xl bg-secondary p-4 text-base text-secondary-foreground">
            <Info className="mt-0.5 h-5 w-5 shrink-0" />
            Toque no botão abaixo quando começar a trabalhar. O horário de entrada será registrado sozinho.
          </p>
          <button className="btn-giant btn-start" disabled={start.isPending} onClick={() => start.mutate()}>
            {start.isPending ? "REGISTRANDO..." : "INICIAR TRABALHO"}
          </button>
        </section>
      )}

      {!failed && (
        <section className="rounded-3xl bg-secondary p-6">
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-secondary-foreground">Horas de hoje</span>
            <span className="font-display text-4xl font-extrabold text-primary">{formatDuration(totalToday)}</span>
          </div>
          <p className="mt-2 text-base text-muted-foreground">
            {closedToday === 0 && !running
              ? "Nenhum horário registrado hoje ainda."
              : running
                ? "O tempo da sessão que está aberta já entra nesta soma."
                : `Soma de ${closedToday} ${closedToday === 1 ? "sessão" : "sessões"} registradas hoje.`}
          </p>
        </section>
      )}

      <AlertDialog open={askStop} onOpenChange={setAskStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl">Finalizar o trabalho agora?</AlertDialogTitle>
            <AlertDialogDescription className="text-lg">
              {running && (
                <>
                  Você começou às <strong>{fmtTime(running.started_at)}</strong> e agora são{" "}
                  <strong>{fmtTime(now.toISOString())}</strong>. O horário de saída será registrado como agora.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 gap-3">
            <AlertDialogCancel className="min-h-14 rounded-2xl text-lg font-bold">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-14 rounded-2xl text-lg font-bold"
              onClick={() => running && stop.mutate(running.id)}
            >
              <CheckCircle2 className="mr-2 h-5 w-5" /> Sim, finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
