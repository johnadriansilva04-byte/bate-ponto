import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, WifiOff } from "lucide-react";
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
import { hasPending, pendingEvents, queue, flush } from "@/lib/outbox";
import { getPosition, type GeoFix } from "@/lib/geo";
import { PinPad } from "@/components/PinPad";
import {
  TZ, dayKey, fmtDate, fmtTime, formatClock, formatDuration, localMidnight, runningSeconds, todaySeconds, tzParts,
  type Session,
} from "@/lib/hours";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bater ponto — Meu Ponto" },
      { name: "description", content: "Toque para começar e para terminar. O tempo é somado sozinho." },
      { property: "og:title", content: "Bater ponto — Meu Ponto" },
      { property: "og:description", content: "Toque para começar e para terminar. O tempo é somado sozinho." },
    ],
  }),
  component: () => (
    <AppShell>
      <Punch />
    </AppShell>
  ),
});

const LONG_SESSION = 16 * 3600;
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const PENDING_ID = "pendente";

function useTicker(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Punch() {
  const qc = useQueryClient();
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [offline, setOffline] = useState(false);
  const [askStop, setAskStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Senha exigida antes de cada toque: "iniciar" ou "finalizar".
  const [pinFor, setPinFor] = useState<null | "iniciar" | "finalizar">(null);

  const open = useQuery({ queryKey: ["open"], queryFn: fetchOpenSession, retry: 1 });
  const running = open.data ?? (pendingStart ? { id: PENDING_ID, started_at: pendingStart, ended_at: null } : null);
  const now = useTicker(!!running);

  const p = tzParts(now);
  const today = dayKey(now);
  const from = new Date(localMidnight(p.y, p.m, p.d)).toISOString();
  const to = new Date(localMidnight(p.y, p.m, p.d) + 86400000).toISOString();
  const day = useQuery({ queryKey: ["day", today], queryFn: () => fetchSessionsBetween(from, to) });

  // The elapsed time comes from the stored start timestamp, so it stays correct
  // whether the app was open the whole time or closed for hours.
  const elapsed = running ? runningSeconds(running, now) : 0;
  const sessions: Session[] = [...(day.data ?? [])];
  if (running && !sessions.some((s) => s.id === running.id)) sessions.push(running);
  const totalToday = todaySeconds(sessions, now);

  const sync = useCallback(async () => {
    setQueued(hasPending());
    if (!navigator.onLine) {
      setOffline(true);
      return;
    }
    setOffline(false);
    try {
      const clean = await flush();
      setQueued(!clean);
      if (clean) {
        setPendingStart(null);
        await qc.invalidateQueries();
      }
    } catch {
      setQueued(hasPending());
    }
  }, [qc]);

  useEffect(() => {
    void sync();
    const onOnline = () => void sync();
    const onVisible = () => document.visibilityState === "visible" && void sync();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", () => setOffline(true));
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sync]);

  const punch = useMutation({
    mutationFn: async (geo: GeoFix) => {
      // O horario do toque e capturado antes de qualquer espera: se o GPS
      // demorar, o ponto continua valendo o instante em que ele apertou.
      const at = new Date().toISOString();
      if (running) {
        if (running.id !== PENDING_ID) {
          const ok = await endSession(running.id, at, geo);
          if (!ok) queue({ kind: "end", id: running.id, at, lat: geo.latitude, lng: geo.longitude, geoStatus: geo.status });
          else return { online: true };
        } else {
          queue({ kind: "end", id: null, at, lat: geo.latitude, lng: geo.longitude, geoStatus: geo.status });
        }
        setPendingStart(null);
      } else {
        const result = await startSession(at, geo);
        if (result.ok && result.session) {
          setPendingStart(null);
          return { online: true };
        }
        queue({ kind: "start", at, lat: geo.latitude, lng: geo.longitude, geoStatus: geo.status });
        setPendingStart(at);
      }
      setQueued(true);
      return { online: false };
    },
    onSuccess: async (r) => {
      if (r.online) {
        setNotice(null);
        await qc.invalidateQueries();
        await sync();
      } else {
        setNotice("Salvando no celular. Vai enviar sozinho quando a internet voltar.");
      }
    },
    onSettled: () => setBusy(false),
  });

  // Chamado pelo teclado depois da senha certa.
  const runPunch = async () => {
    setBusy(true);
    setNotice(null);
    setPinFor(null);
    // O GPS espera no maximo alguns segundos; sem sinal, o ponto segue igual.
    const geo = await getPosition();
    punch.mutate(geo);
  };

  const press = () => {
    if (busy) return;
    setNotice(null);
    // Sempre pede a senha primeiro, para iniciar e para finalizar.
    setPinFor(running ? "finalizar" : "iniciar");
  };

  const loading = open.isLoading && !pendingStart;
  const broken = open.isError && !pendingStart;
  const longOpen = running && elapsed > LONG_SESSION;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <p className="text-xl capitalize text-muted-foreground">{dateFmt.format(now)}</p>

      {offline && (
        <p className="flex items-center gap-2 rounded-2xl bg-warning px-4 py-3 text-lg font-bold text-warning-foreground">
          <WifiOff className="h-6 w-6" /> Sem internet
        </p>
      )}

      {broken && (
        <p className="flex items-center gap-2 rounded-2xl bg-warning px-4 py-3 text-lg font-bold text-warning-foreground">
          <WifiOff className="h-6 w-6" /> Sem conexão. Você ainda pode bater o ponto.
        </p>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-4 py-10">
          <Loader2 className="h-14 w-14 animate-spin text-primary" />
          <p className="text-2xl font-bold">Carregando…</p>
        </div>
      ) : longOpen ? (
        // Past 16h the giant ticking clock stops being useful, so the warning
        // replaces it: the user decides, the app never invents an exit.
        <div className="w-full space-y-4 rounded-3xl bg-warning p-5 text-left text-warning-foreground">
          <p className="flex items-center gap-2 text-xl font-bold">
            <AlertTriangle className="h-7 w-7" /> Você esqueceu de finalizar?
          </p>
          <p className="text-lg">
            A sessão está aberta desde {fmtDate(running!.started_at)} às {fmtTime(running!.started_at)}. Encerre agora ou
            ajuste o horário no Histórico. Nada é encerrado sozinho.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={() => setAskStop(true)} className="min-h-16 flex-1 rounded-2xl bg-card px-4 text-lg font-bold text-foreground">
              Encerrar agora
            </button>
            <Link to="/historico" className="flex min-h-16 flex-1 items-center justify-center rounded-2xl bg-card px-4 text-lg font-bold text-foreground">
              <CalendarDays className="mr-2 h-5 w-5" /> Ajustar horário
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* One number only: what the user cares about right now. */}
          <div className="w-full">
            <p className="text-2xl font-bold uppercase tracking-wide text-muted-foreground">
              {running ? "Trabalhando agora" : "Horas de hoje"}
            </p>
            <p
              className="font-display text-[22vw] font-extrabold leading-none tabular-nums text-primary sm:text-8xl"
              suppressHydrationWarning
            >
              {running ? formatClock(elapsed) : broken ? "—" : formatDuration(totalToday)}
            </p>
            <p className="mt-2 text-xl text-muted-foreground">
              {running
                ? `Começou às ${fmtTime(running.started_at)}${
                    dayKey(new Date(running.started_at)) !== today ? ` de ${fmtDate(running.started_at)}` : ""
                  }`
                : broken
                  ? "Não deu para carregar agora. Bata o ponto normalmente."
                  : totalToday > 0
                    ? "Some tudo que você já trabalhou hoje."
                    : "Nada registrado hoje ainda."}
            </p>
          </div>

          <button
            className={`btn-giant ${running ? "btn-stop" : "btn-start"}`}
            disabled={busy}
            aria-busy={busy}
            onClick={() => (running ? setAskStop(true) : press())}
          >
            {busy ? (
              <span className="flex items-center justify-center gap-3">
                <Loader2 className="h-9 w-9 animate-spin" /> REGISTRANDO…
              </span>
            ) : running ? (
              "FINALIZAR TRABALHO"
            ) : (
              "INICIAR TRABALHO"
            )}
          </button>
        </>
      )}

      {notice && (
        <p className="rounded-2xl bg-secondary px-4 py-3 text-lg font-bold text-secondary-foreground">{notice}</p>
      )}

      {queued && !notice && (
        <p className="text-base font-bold text-muted-foreground">
          {pendingEvents().length} registro(s) aguardando internet…
        </p>
      )}

      <AlertDialog open={askStop} onOpenChange={setAskStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl">Finalizar agora?</AlertDialogTitle>
            <AlertDialogDescription className="text-lg">
              {running && (
                <>
                  Você começou às <strong>{fmtTime(running.started_at)}</strong>. A saída será registrada com a hora de
                  agora.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 gap-3">
            <AlertDialogCancel className="min-h-14 rounded-2xl text-lg font-bold">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-14 rounded-2xl text-lg font-bold"
              onClick={() => {
                setAskStop(false);
                setPinFor("finalizar");
              }}
            >
              <CheckCircle2 className="mr-2 h-5 w-5" /> Sim, finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PinPad
        open={pinFor !== null}
        action={pinFor ?? "iniciar"}
        onCancel={() => setPinFor(null)}
        onOk={() => void runPunch()}
      />
    </div>
  );
}
