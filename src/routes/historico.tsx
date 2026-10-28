import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, AlertTriangle, CalendarX, WifiOff, RefreshCw, Printer, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { FichaPonto } from "@/components/FichaPonto";
import { ProvaIntegridade } from "@/components/ProvaIntegridade";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  endSession, fetchAllRates, fetchAllSessions, fetchMonth, fetchRate, fetchTitular, fetchWorkplace, fixSession,
  localInputToIso, saveRate,
} from "@/lib/sessions-api";
import {
  buildMonth, dayKey, earningsCents, fmtDate, fmtTime, formatBRL, formatDuration, sessionSeconds, tzParts, type Session,
} from "@/lib/hours";
import { formatCoords, geoLabel } from "@/lib/geo";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de horas — Meu Ponto" },
      { name: "description", content: "Veja suas horas por semana e o total do mês, com valor a receber opcional." },
      { property: "og:title", content: "Histórico de horas — Meu Ponto" },
      { property: "og:description", content: "Veja suas horas por semana e o total do mês, com valor a receber opcional." },
    ],
  }),
  component: () => (
    <AppShell>
      <History />
    </AppShell>
  ),
});

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function History() {
  const now = new Date();
  const t = tzParts(now);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const [fixing, setFixing] = useState<Session | null>(null);
  // "mes" = mes escolhido; "tudo" = linha do tempo completa.
  const [scope, setScope] = useState<"mes" | "tudo">("mes");
  const q = useQuery({ queryKey: ["month", ym.y, ym.m], queryFn: () => fetchMonth(ym.y, ym.m) });
  const allQ = useQuery({ queryKey: ["all"], queryFn: fetchAllSessions, enabled: scope === "tudo" });
  const titularQ = useQuery({ queryKey: ["titular"], queryFn: fetchTitular, staleTime: Infinity });
  const rateQ = useQuery({ queryKey: ["rate", ym.y, ym.m], queryFn: () => fetchRate(ym.y, ym.m) });
  // Local de trabalho em vigor, para constar na ficha impressa.
  const localQ = useQuery({ queryKey: ["workplace"], queryFn: fetchWorkplace, staleTime: 300_000 });
  const valorHora = scope === "mes" ? (rateQ.data ?? null) : null;
  const report = buildMonth(ym.y, ym.m, q.data ?? [], now);
  const todayKey = dayKey(now);

  const shift = (d: number) => {
    const idx = ym.y * 12 + (ym.m - 1) + d;
    setYm({ y: Math.floor(idx / 12), m: (idx % 12) + 1 });
  };
  const years = Array.from({ length: 8 }, (_, i) => t.y - 6 + i);
  const sel = "rounded-xl border-2 border-input bg-card px-3 py-4 text-2xl font-bold";
  // Só a semana de hoje aparece: a tela cabe inteira, sem rolar. As setas
  // trocam de semana, e "picked" guarda a escolha do usuário (null = a de hoje).
  const currentWeek = report.weeks.findIndex((w) => w.days.some((d) => d.key === todayKey));
  const [picked, setPicked] = useState<number | null>(null);
  const weekIdx = useMemo(() => {
    if (picked !== null && picked >= 0 && picked < report.weeks.length) return picked;
    return currentWeek >= 0 ? currentWeek : 0;
  }, [picked, currentWeek, report.weeks.length]);
  // Ao trocar de mês a escolha anterior não vale mais.
  useEffect(() => setPicked(null), [ym.y, ym.m]);

  // Para a ficha: no mes, as sessoes do mes; em "tudo", a linha completa.
  const fichaSessions = useMemo(() => {
    if (scope === "tudo") return allQ.data ?? [];
    return [...(q.data ?? [])].sort((a, b) => a.started_at.localeCompare(b.started_at));
  }, [scope, allQ.data, q.data]);

  const fichaTotal = useMemo(
    () => fichaSessions.reduce((acc, s) => acc + (s.ended_at ? (sessionSeconds(s) ?? 0) : 0), 0),
    [fichaSessions],
  );
  const fichaDias = useMemo(
    () => new Set(fichaSessions.filter((s) => s.ended_at).map((s) => dayKey(new Date(s.started_at)))).size,
    [fichaSessions],
  );

  const periodLabel = useMemo(() => {
    if (scope !== "tudo") return `${MONTHS[ym.m - 1]} de ${ym.y}`;
    const first = fichaSessions[0];
    const last = fichaSessions[fichaSessions.length - 1];
    if (!first || !last) return "todo o período";
    return `${fmtDate(first.started_at)} a ${fmtDate(last.started_at)}`;
  }, [scope, fichaSessions, ym.y, ym.m]);

  return (
    <div className="space-y-6">
      {/* Escolha do periodo: o mes atual por padrao, ou tudo o que ja foi registrado. */}
      <section className="no-print grid grid-cols-2 gap-2 rounded-3xl bg-card p-2 shadow-soft">
        <button
          onClick={() => setScope("mes")}
          aria-pressed={scope === "mes"}
          className={`min-h-14 rounded-2xl text-lg font-bold ${scope === "mes" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
        >
          MÊS
        </button>
        <button
          onClick={() => setScope("tudo")}
          aria-pressed={scope === "tudo"}
          className={`min-h-14 rounded-2xl text-lg font-bold ${scope === "tudo" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
        >
          TODO O PERÍODO
        </button>
      </section>

      {scope === "mes" && (
        <section className="no-print flex items-center gap-2 rounded-3xl bg-card p-3 shadow-soft">
          <button aria-label="Mês anterior" onClick={() => shift(-1)} className="rounded-2xl bg-secondary p-3"><ChevronLeft className="h-9 w-9" /></button>
          <div className="flex flex-1 justify-center gap-2">
            <select aria-label="Mês" className={sel} value={ym.m} onChange={(e) => setYm({ ...ym, m: Number(e.target.value) })}>
              {MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
            </select>
            <select aria-label="Ano" className={sel} value={ym.y} onChange={(e) => setYm({ ...ym, y: Number(e.target.value) })}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button aria-label="Próximo mês" onClick={() => shift(1)} className="rounded-2xl bg-secondary p-3"><ChevronRight className="h-9 w-9" /></button>
        </section>
      )}

      {scope === "tudo" ? (
        <FullPeriod sessions={allQ.data ?? []} loading={allQ.isLoading} error={allQ.isError} onRetry={() => allQ.refetch()} />
      ) : q.isLoading ? (
        <div className="h-40 animate-pulse rounded-3xl bg-muted" />
      ) : q.isError ? (
        <section className="space-y-4 rounded-3xl bg-warning p-6 text-warning-foreground">
          <p className="flex items-center gap-2 text-lg font-bold">
            <WifiOff className="h-6 w-6" /> Sem conexão com seus horários
          </p>
          <p className="text-base">
            Não conseguimos carregar este mês agora. Confira a internet e tente de novo. Nada foi perdido.
          </p>
          <button
            onClick={() => q.refetch()}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-card px-4 text-lg font-bold text-foreground"
          >
            <RefreshCw className="h-6 w-6" /> TENTAR DE NOVO
          </button>
        </section>
      ) : (
        <>
          {/* Month summary first: the number the user came here for. */}
          <Summary report={report} ym={ym} />

          {report.incomplete.length > 0 && (
            <section className="rounded-3xl bg-warning p-5 text-warning-foreground">
              <p className="flex items-center gap-2 text-lg font-bold"><AlertTriangle className="h-6 w-6" /> Você esqueceu de finalizar?</p>
              <p className="mt-1 text-base">Essas horas só entram na soma depois que você informar a saída.</p>
              {report.incomplete.map((s) => (
                <div key={s.id} className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-base font-bold">Entrada {fmtDate(s.started_at)} às {fmtTime(s.started_at)}</span>
                  <button onClick={() => setFixing(s)} className="min-h-14 rounded-xl bg-card px-4 text-base font-bold text-foreground">Informar saída</button>
                </div>
              ))}
            </section>
          )}

          {report.sessionCount === 0 ? (
            <section className="rounded-3xl bg-card p-8 text-center shadow-soft">
              <CalendarX className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-xl font-bold">Nenhum horário neste mês</p>
              <p className="mt-2 text-base text-muted-foreground">
                Você ainda não registrou horas em {MONTHS[ym.m - 1]} de {ym.y}. Use as setas acima para ver outro mês.
              </p>
            </section>
          ) : (
            <section className="space-y-3">
              <h2 className="text-2xl font-extrabold">Semana</h2>
              {/* Uma semana por vez: a tela inteira cabe sem rolar. As setas
                  trocam de semana e o total do mes fica logo acima. */}
              <div className="flex items-center gap-2">
                <button
                  aria-label="Semana anterior"
                  onClick={() => setPicked(Math.max(0, weekIdx - 1))}
                  disabled={weekIdx === 0}
                  className="rounded-2xl bg-secondary p-3 disabled:opacity-40"
                >
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <div className="flex-1 rounded-2xl bg-secondary px-4 py-3 text-center">
                  <div className="font-display text-xl font-bold">
                    Semana {weekIdx + 1} de {report.weeks.length}
                  </div>
                  <div className="text-base text-muted-foreground">
                    {weekRangeLabel(report.weeks[weekIdx])} · {formatDuration(report.weeks[weekIdx]?.seconds ?? 0)}
                  </div>
                </div>
                <button
                  aria-label="Próxima semana"
                  onClick={() => setPicked(Math.min(report.weeks.length - 1, weekIdx + 1))}
                  disabled={weekIdx >= report.weeks.length - 1}
                  className="rounded-2xl bg-secondary p-3 disabled:opacity-40"
                >
                  <ChevronRight className="h-8 w-8" />
                </button>
              </div>
              {currentWeek >= 0 && weekIdx !== currentWeek && (
                <button
                  onClick={() => setPicked(currentWeek)}
                  className="min-h-14 w-full rounded-2xl bg-accent px-4 text-base font-bold text-accent-foreground"
                >
                  Voltar para esta semana
                </button>
              )}
              {report.weeks[weekIdx] && <WeekTable week={report.weeks[weekIdx]!} />}
            </section>
          )}
        </>
      )}

      {/* Conferencia de integridade: codigo que o usuario pode fotografar. */}
      {scope === "mes" && <ProvaIntegridade />}

      {/* Impressao: vale para o mes escolhido ou para o periodo completo. */}
      <PrintBar
        periodLabel={periodLabel}
        totalSeconds={fichaTotal}
        dias={fichaDias}
        disabled={fichaSessions.length === 0}
        valorHora={valorHora}
      />

      <FichaPonto
        sessions={fichaSessions}
        periodo={{ rotulo: periodLabel, de: null, ate: null }}
        valorHora={valorHora}
        totalSeconds={fichaTotal}
        diasTrabalhados={fichaDias}
        nome={titularQ.data?.nome ?? ""}
        cpf={titularQ.data?.cpf ?? ""}
        localTrabalho={localQ.data?.endereco ?? null}
      />

      <FixDialog session={fixing} onClose={() => setFixing(null)} />
    </div>
  );
}

function PrintBar({
  periodLabel,
  totalSeconds,
  dias,
  disabled,
  valorHora,
}: {
  periodLabel: string;
  totalSeconds: number;
  dias: number;
  disabled: boolean;
  valorHora: number | null;
}) {
  return (
    <section className="no-print space-y-4 rounded-3xl border-2 border-primary bg-card p-5 shadow-soft">
      <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-primary">
        <ShieldCheck className="h-6 w-6" /> FICHA DE PONTO
      </h2>
      <p className="text-base text-muted-foreground">
        {periodLabel} · {dias} dia(s) · {formatDuration(totalSeconds)}
        {valorHora !== null ? ` · ${formatBRL(earningsCents(totalSeconds, valorHora))}` : ""}
      </p>
      <p className="text-base text-muted-foreground">
        Sai uma folha A4 com seu nome, o dia a dia, o local e o lacre de cada registro, mais o espaço para as duas
        assinaturas.
      </p>
      <button
        onClick={() => window.print()}
        disabled={disabled}
        className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-4 text-xl font-extrabold text-primary-foreground disabled:opacity-50"
      >
        <Printer className="h-7 w-7" /> IMPRIMIR FICHA DE PONTO / GERAR PDF
      </button>
    </section>
  );
}

function FullPeriod({
  sessions,
  loading,
  error,
  onRetry,
}: {
  sessions: Session[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const total = sessions.reduce((acc, s) => acc + (s.ended_at ? (sessionSeconds(s) ?? 0) : 0), 0);
  const dias = new Set(sessions.filter((s) => s.ended_at).map((s) => dayKey(new Date(s.started_at)))).size;

  if (loading) return <div className="h-40 animate-pulse rounded-3xl bg-muted" />;
  if (error)
    return (
      <section className="space-y-4 rounded-3xl bg-warning p-6 text-warning-foreground">
        <p className="text-lg font-bold">Não deu para carregar o histórico completo.</p>
        <button onClick={onRetry} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-card px-4 text-lg font-bold text-foreground">
          <RefreshCw className="h-6 w-6" /> TENTAR DE NOVO
        </button>
      </section>
    );

  return (
    <>
      <section className="rounded-3xl border-2 border-primary bg-card p-6 shadow-soft">
        <h2 className="font-display text-2xl font-extrabold text-primary">TODO O PERÍODO</h2>
        <p className="mt-4 text-xl font-bold text-muted-foreground">Total trabalhado</p>
        <p className="font-display text-5xl font-extrabold text-primary">{formatDuration(total)}</p>
        <dl className="mt-4 space-y-3 border-t pt-4 text-lg">
          <div className="flex justify-between"><dt>Dias com trabalho</dt><dd className="font-bold">{dias}</dd></div>
          <div className="flex justify-between"><dt>Entradas registradas</dt><dd className="font-bold">{sessions.length}</dd></div>
        </dl>
      </section>

      <section className="overflow-hidden rounded-3xl bg-card shadow-soft">
        <table className="w-full text-left text-base tabular-nums">
          <thead className="bg-secondary text-sm uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Dia</th>
              <th className="px-2 py-2">Entrada</th>
              <th className="px-2 py-2">Saída</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Nada registrado ainda.</td></tr>
            )}
            {sessions.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-3 py-3 font-bold">{fmtDate(s.started_at)}</td>
                <td className="px-2 py-3">{fmtTime(s.started_at)}</td>
                <td className="px-2 py-3">
                  {s.ended_at ? fmtTime(s.ended_at) : <span className="font-bold text-destructive">em aberto</span>}
                </td>
                <td className="px-3 py-3 text-right font-bold">{s.ended_at ? formatDuration(sessionSeconds(s) ?? 0) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

/** "26/10 a 01/11" para o cabeçalho da semana. */
function weekRangeLabel(week: ReturnType<typeof buildMonth>["weeks"][number] | undefined): string {
  const days = week?.days ?? [];
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return "";
  const d = (x: { day: number; key: string }) => `${String(x.day).padStart(2, "0")}/${x.key.slice(5, 7)}`;
  return `${d(first)} a ${d(last)}`;
}

function WeekTable({ week }: { week: ReturnType<typeof buildMonth>["weeks"][number] }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-soft">
      <table className="w-full text-left text-base tabular-nums">
        <thead className="bg-secondary text-sm uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Dia</th>
            <th className="px-2 py-2">Entrada</th>
            <th className="px-2 py-2">Saída</th>
            <th className="px-3 py-2 text-right">Total do dia</th>
          </tr>
        </thead>
        <tbody>
          {week.days.map((d) => {
            const rows = d.sessions.length || 1;
            const cls = d.isToday ? "bg-accent" : "";
            return (
              <Fragment key={d.key}>
                {Array.from({ length: rows }, (_, r) => {
                  const s = d.sessions[r];
                  const dur = s ? sessionSeconds(s) : null;
                  const crosses = s?.ended_at && dayKey(new Date(s.ended_at)) !== d.key;
                  return (
                    <tr key={r} className={`${cls} ${r === rows - 1 ? "border-b" : ""}`}>
                      {r === 0 && (
                        <td rowSpan={rows} className="px-3 py-3 align-top">
                          <div className="font-bold">{d.weekday}</div>
                          <div className="text-muted-foreground">{String(d.day).padStart(2, "0")}/{d.key.slice(5, 7)}</div>
                          {d.isToday && <div className="text-xs font-bold text-primary">HOJE</div>}
                        </td>
                      )}
                      <td className="px-2 py-3">{s ? fmtTime(s.started_at) : "—"}</td>
                      <td className="px-2 py-3">
                        {!s ? "—" : s.ended_at ? (
                          <>
                            {fmtTime(s.ended_at)}
                            {crosses && <div className="text-xs text-muted-foreground">{fmtDate(s.ended_at)}</div>}
                          </>
                        ) : <span className="font-bold text-destructive">em aberto</span>}
                        {s && dur !== null && rows > 1 && <div className="text-xs text-muted-foreground">({formatDuration(dur)})</div>}
                        {s && s.ended_at && (
                          <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
                            <span className="inline-flex items-center gap-1 font-bold text-primary">
                              <ShieldCheck className="h-3 w-3" /> Lacre
                            </span>
                            <div className="font-mono break-all">{s.session_hash ? `${s.session_hash.slice(0, 16)}…` : "—"}</div>
                            <div>{geoLabel(s.end_geo_status ?? s.start_geo_status)}</div>
                          </div>
                        )}
                      </td>
                      {r === 0 && (
                        <td rowSpan={rows} className="px-3 py-3 text-right align-top">
                          <span className={`inline-block rounded-lg px-2 py-1 font-bold ${d.seconds > 0 ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
                            {formatDuration(d.seconds)}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-secondary">
            <td colSpan={3} className="px-3 py-3 font-bold">Total da semana</td>
            <td className="px-3 py-3 text-right font-display text-xl font-extrabold text-primary">{formatDuration(week.seconds)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Summary({ report, ym }: { report: ReturnType<typeof buildMonth>; ym: { y: number; m: number } }) {
  const qc = useQueryClient();
  const rateQ = useQuery({ queryKey: ["rate", ym.y, ym.m], queryFn: () => fetchRate(ym.y, ym.m) });
  const [text, setText] = useState("");
  useEffect(() => {
    setText(rateQ.data != null ? String(rateQ.data).replace(".", ",") : "");
  }, [rateQ.data, ym.y, ym.m]);
  const parsed = text.trim() ? Number(text.replace(/\./g, "").replace(",", ".")) : null;
  const valid = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const totals = {
    totalSeconds: report.totalSeconds,
    daysWorked: report.daysWorked,
    sessionCount: report.sessionCount,
  };
  const save = useMutation({
    mutationFn: () => saveRate(ym.y, ym.m, valid, totals),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate", ym.y, ym.m] }),
    onError: () => toast.error("Não foi possível salvar o valor. Tente de novo."),
  });

  return (
    <section className="rounded-3xl border-2 border-primary bg-card p-6 shadow-soft">
      <h2 className="font-display text-2xl font-extrabold text-primary">RESUMO DO MÊS</h2>
      <p className="mt-4 text-xl font-bold text-muted-foreground">Total trabalhado</p>
      <p className="font-display text-5xl font-extrabold text-primary">{formatDuration(report.totalSeconds)}</p>
      <dl className="mt-4 space-y-3 border-t pt-4 text-lg">
        <div className="flex justify-between"><dt>Dias com trabalho</dt><dd className="font-bold">{report.daysWorked}</dd></div>
        <div className="flex justify-between"><dt>Entradas registradas</dt><dd className="font-bold">{report.sessionCount}</dd></div>
      </dl>
      <label className="mt-6 block">
        <span className="mb-1 block text-lg font-bold">Quanto você ganha por hora? (opcional)</span>
        <span className="mb-2 block text-base text-muted-foreground">Preencha só se quiser ver o valor a receber. Pode deixar vazio.</span>
        <div className="flex items-center gap-2 rounded-2xl border-2 border-input bg-background px-4 focus-within:border-primary">
          <span className="text-xl font-bold text-muted-foreground">R$</span>
          <input
            inputMode="decimal"
            placeholder="0,00"
            className="w-full bg-transparent py-4 text-xl outline-none"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ""))}
            onBlur={() => save.mutate()}
          />
        </div>
      </label>
      {valid !== null && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-accent p-4">
          <span className="text-lg font-bold text-accent-foreground">Valor a receber</span>
          <span className="font-display text-3xl font-extrabold text-accent-foreground">{formatBRL(earningsCents(report.totalSeconds, valid))}</span>
        </div>
      )}
    </section>
  );
}

function FixDialog({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const fix = useMutation({
    mutationFn: async () => {
      const iso = localInputToIso(value);
      if (!session) throw new Error("Sessão inválida.");
      if (iso <= session.started_at) throw new Error("A saída precisa ser depois da entrada.");
      if (new Date(iso) > new Date()) throw new Error("A saída não pode ser no futuro.");
      // Passa pela funcao do banco: exige motivo, audita e recalcula o lacre.
      const err = await fixSession(session.id, iso, reason);
      if (err) throw new Error(err);
    },
    onSuccess: () => {
      toast.success("Saída registrada! As horas entraram na soma.");
      qc.invalidateQueries();
      setReason("");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo."),
  });
  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-2xl">Informar horário de saída</DialogTitle></DialogHeader>
        {session && <p className="text-lg">Entrada: {fmtDate(session.started_at)} às {fmtTime(session.started_at)}</p>}
        <p className="text-base text-muted-foreground">Escolha abaixo o horário em que você parou de trabalhar.</p>
        <input type="datetime-local" className="w-full rounded-2xl border-2 border-input px-4 py-4 text-xl" value={value} onChange={(e) => setValue(e.target.value)} />
        <label className="block">
          <span className="mb-1 block text-base font-bold">Por que está corrigindo?</span>
          <span className="mb-2 block text-sm text-muted-foreground">
            Fica registrado no histórico de auditoria junto com o lacre anterior.
          </span>
          <input
            placeholder="Ex.: esqueci de finalizar e parei às 17h"
            className="w-full rounded-2xl border-2 border-input bg-background px-4 py-4 text-lg"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          disabled={!value || reason.trim().length < 3 || fix.isPending}
          onClick={() => fix.mutate()}
          className="btn-giant btn-start !min-h-16 !text-xl"
        >
          SALVAR SAÍDA
        </button>
      </DialogContent>
    </Dialog>
  );
}
