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
import {
  endSession,
  fetchOpenSession,
  fetchSessionsBetween,
  fetchWorkplace,
  startSession,
} from "@/lib/sessions-api";
import { hasPending, pendingEvents, queue, flush } from "@/lib/outbox";
import { decidirAviso, getPosition, type AvisoFora, type GeoFix } from "@/lib/geo";
import { PinPad } from "@/components/PinPad";
import { AvisoForaLocal } from "@/components/AvisoForaLocal";
import { WorkplaceDialog } from "@/components/WorkplaceDialog";
import { primeiroNome } from "@/lib/titular";
import { bomDescanso, bomTrabalho, cumprimento } from "@/lib/saudacao";
import {
  TZ,
  dayKey,
  fmtDate,
  fmtTime,
  formatClock,
  formatDuration,
  localMidnight,
  runningSeconds,
  todaySeconds,
  tzParts,
  type Session,
} from "@/lib/hours";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bater ponto — Meu Ponto" },
      {
        name: "description",
        content: "Toque para começar e para terminar. O tempo é somado sozinho.",
      },
      { property: "og:title", content: "Bater ponto — Meu Ponto" },
      {
        property: "og:description",
        content: "Toque para começar e para terminar. O tempo é somado sozinho.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <Punch />
    </AppShell>
  ),
});

const LONG_SESSION = 16 * 3600;
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});
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
  // Saudacao logo depois do toque: "Bom trabalho, João!" ou "Bom descanso, João!".
  const [greet, setGreet] = useState<string | null>(null);
  // Senha exigida antes de cada toque: "iniciar" ou "finalizar".
  const [pinFor, setPinFor] = useState<null | "iniciar" | "finalizar">(null);
  // Troca do local de trabalho: raro, por isso fica atras de um botao.
  const [askLocal, setAskLocal] = useState(false);
  // Ponto registrado fora do local previsto: guarda os dados do toque para o
  // aviso vermelho. null = nada a avisar (dentro do raio, ou sem GPS).
  const [foraLocal, setForaLocal] = useState<AvisoFora | null>(null);

  const nome = primeiroNome();

  const open = useQuery({ queryKey: ["open"], queryFn: fetchOpenSession, retry: 1 });
  const running =
    open.data ??
    (pendingStart ? { id: PENDING_ID, started_at: pendingStart, ended_at: null } : null);
  const now = useTicker(!!running);

  const p = tzParts(now);
  const today = dayKey(now);
  const from = new Date(localMidnight(p.y, p.m, p.d)).toISOString();
  const to = new Date(localMidnight(p.y, p.m, p.d) + 86400000).toISOString();
  const day = useQuery({ queryKey: ["day", today], queryFn: () => fetchSessionsBetween(from, to) });
  // Local de trabalho em uso: aparece na tela para ele conferir onde o ponto
  // esta sendo registrado, e vai junto no lacre de cada sessao.
  const local = useQuery({ queryKey: ["workplace"], queryFn: fetchWorkplace, staleTime: 300_000 });

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
          if (!ok)
            queue({
              kind: "end",
              id: running.id,
              at,
              lat: geo.latitude,
              lng: geo.longitude,
              geoStatus: geo.status,
            });
          else return { online: true };
        } else {
          queue({
            kind: "end",
            id: null,
            at,
            lat: geo.latitude,
            lng: geo.longitude,
            geoStatus: geo.status,
          });
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
    setForaLocal(null);
    // A saudacao e escolhida antes de esperar o GPS, para o texto ser o do
    // toque que ele acabou de fazer.
    const eraFinalizar = !!running;
    setGreet(eraFinalizar ? bomDescanso(nome) : bomTrabalho(nome));
    // O GPS espera no maximo alguns segundos; sem sinal, o ponto segue igual.
    const geo = await getPosition();
    // Compara o toque com o local previsto e, se estiver longe, guarda os dados
    // para o aviso vermelho. O ponto e registrado de qualquer forma.
    const w = local.data;
    setForaLocal(
      decidirAviso(
        geo,
        w
          ? {
              endereco: w.endereco,
              latitude: w.latitude,
              longitude: w.longitude,
              raioMetros: w.raioMetros,
            }
          : null,
        eraFinalizar,
      ),
    );
    punch.mutate(geo);
  };

  const press = () => {
    if (busy) return;
    setNotice(null);
    setGreet(null);
    setForaLocal(null);
    // Sempre pede a senha primeiro, para iniciar e para finalizar.
    setPinFor(running ? "finalizar" : "iniciar");
  };

  const loading = open.isLoading && !pendingStart;
  const broken = open.isError && !pendingStart;
  const longOpen = running && elapsed > LONG_SESSION;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      {/* Cumprimento pelo nome, com a data logo abaixo. */}
      <div>
        <p
          className="font-display text-3xl font-extrabold text-primary sm:text-4xl"
          suppressHydrationWarning
        >
          {cumprimento(nome, tzParts(now).hh)}
        </p>
        <p className="mt-1 text-xl capitalize text-muted-foreground">{dateFmt.format(now)}</p>
      </div>

      {/* Depois do toque, a confirmacao aparece grande e em verde. */}
      {greet && (
        <p
          role="status"
          className="w-full rounded-2xl bg-primary px-5 py-4 text-2xl font-extrabold text-primary-foreground sm:text-3xl"
        >
          {greet}
        </p>
      )}

      {/* Toque longe do local de costume: aviso vermelho, com o lugar previsto
          e o lugar onde o ponto foi realmente registrado. */}
      {foraLocal && (
        <AvisoForaLocal
          fix={foraLocal.fix}
          previsto={foraLocal.previsto}
          distancia={foraLocal.distancia}
          toque={foraLocal.toque}
          onFechar={() => setForaLocal(null)}
        />
      )}

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
            A sessão está aberta desde {fmtDate(running!.started_at)} às{" "}
            {fmtTime(running!.started_at)}. Encerre agora ou ajuste o horário no Histórico. Nada é
            encerrado sozinho.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => setAskStop(true)}
              className="min-h-16 flex-1 rounded-2xl bg-card px-4 text-lg font-bold text-foreground"
            >
              Encerrar agora
            </button>
            <Link
              to="/historico"
              className="flex min-h-16 flex-1 items-center justify-center rounded-2xl bg-card px-4 text-lg font-bold text-foreground"
            >
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
                    dayKey(new Date(running.started_at)) !== today
                      ? ` de ${fmtDate(running.started_at)}`
                      : ""
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
        <p className="rounded-2xl bg-secondary px-4 py-3 text-lg font-bold text-secondary-foreground">
          {notice}
        </p>
      )}

      {/* Onde o ponto esta sendo registrado. Fica visivel e em letra grande. */}
      {local.data && (
        <div className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3">
          <p className="text-base font-bold uppercase tracking-wide text-muted-foreground">
            Local de trabalho
          </p>
          <p className="text-lg font-bold text-foreground">{local.data.endereco}</p>
          <button
            type="button"
            onClick={() => setAskLocal(true)}
            className="mt-2 text-base font-bold text-primary underline"
          >
            Trocar de local
          </button>
        </div>
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
                  Você começou às <strong>{fmtTime(running.started_at)}</strong>. A saída será
                  registrada com a hora de agora.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 gap-3">
            <AlertDialogCancel className="min-h-14 rounded-2xl text-lg font-bold">
              Cancelar
            </AlertDialogCancel>
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

      <WorkplaceDialog open={askLocal} onClose={() => setAskLocal(false)} />
    </div>
  );
}
