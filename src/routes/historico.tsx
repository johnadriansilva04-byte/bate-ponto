import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { endSession, fetchMonth, fetchRate, localInputToIso, saveRate } from "@/lib/sessions-api";
import {
  buildMonth, dayKey, earningsCents, fmtDate, fmtTime, formatBRL, formatDuration, sessionSeconds, tzParts, type Session,
} from "@/lib/hours";

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
  const q = useQuery({ queryKey: ["month", ym.y, ym.m], queryFn: () => fetchMonth(ym.y, ym.m) });
  const report = buildMonth(ym.y, ym.m, q.data ?? [], now);

  const shift = (d: number) => {
    const idx = ym.y * 12 + (ym.m - 1) + d;
    setYm({ y: Math.floor(idx / 12), m: (idx % 12) + 1 });
  };
  const years = Array.from({ length: 8 }, (_, i) => t.y - 6 + i);
  const sel = "rounded-xl border-2 border-input bg-card px-3 py-3 text-xl font-bold";

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-2 rounded-3xl bg-card p-3 shadow-soft">
        <button aria-label="Mês anterior" onClick={() => shift(-1)} className="rounded-2xl bg-secondary p-3"><ChevronLeft className="h-8 w-8" /></button>
        <div className="flex flex-1 justify-center gap-2">
          <select aria-label="Mês" className={sel} value={ym.m} onChange={(e) => setYm({ ...ym, m: Number(e.target.value) })}>
            {MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
          <select aria-label="Ano" className={sel} value={ym.y} onChange={(e) => setYm({ ...ym, y: Number(e.target.value) })}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button aria-label="Próximo mês" onClick={() => shift(1)} className="rounded-2xl bg-secondary p-3"><ChevronRight className="h-8 w-8" /></button>
      </section>

      {report.incomplete.length > 0 && (
        <section className="rounded-3xl bg-warning p-5 text-warning-foreground">
          <p className="flex items-center gap-2 text-lg font-bold"><AlertTriangle className="h-6 w-6" /> Sessão sem saída registrada</p>
          {report.incomplete.map((s) => (
            <div key={s.id} className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span>Entrada {fmtDate(s.started_at)} às {fmtTime(s.started_at)}</span>
              <button onClick={() => setFixing(s)} className="rounded-xl bg-card px-4 py-2 font-bold text-foreground">Informar saída</button>
            </div>
          ))}
          <p className="mt-2 text-sm">Essas horas não entram na soma até a saída ser informada.</p>
        </section>
      )}

      {q.isLoading ? (
        <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      ) : (
        report.weeks.map((w, i) => <WeekTable key={i} index={i} week={w} />)
      )}

      <Summary report={report} ym={ym} />
      <FixDialog session={fixing} onClose={() => setFixing(null)} />
    </div>
  );
}

function WeekTable({ week, index }: { week: ReturnType<typeof buildMonth>["weeks"][number]; index: number }) {
  return (
    <section className="overflow-hidden rounded-3xl bg-card shadow-soft">
      <h2 className="bg-primary px-5 py-3 font-display text-xl font-bold text-primary-foreground">Semana {index + 1}</h2>
      <table className="w-full text-left text-base tabular-nums">
        <thead className="bg-secondary text-sm uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Dia</th>
            <th className="px-2 py-2">Entrada</th>
            <th className="px-2 py-2">Saída</th>
            <th className="px-3 py-2 text-right">Horas</th>
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
    </section>
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
    onError: () => toast.error("Não foi possível salvar o valor."),
  });

  return (
    <section className="rounded-3xl border-2 border-primary bg-card p-6 shadow-soft">
      <h2 className="font-display text-2xl font-extrabold text-primary">RESUMO DO MÊS</h2>
      <dl className="mt-4 space-y-3 text-lg">
        <div className="flex justify-between"><dt>Dias com trabalho</dt><dd className="font-bold">{report.daysWorked}</dd></div>
        <div className="flex justify-between"><dt>Sessões</dt><dd className="font-bold">{report.sessionCount}</dd></div>
        <div className="flex items-center justify-between border-t pt-3"><dt className="font-bold">Total trabalhado</dt><dd className="font-display text-4xl font-extrabold text-primary">{formatDuration(report.totalSeconds)}</dd></div>
      </dl>
      <label className="mt-6 block">
        <span className="mb-2 block text-lg font-bold">Valor da sua hora (opcional)</span>
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
          <span className="text-lg font-bold text-accent-foreground">Total estimado</span>
          <span className="font-display text-3xl font-extrabold text-accent-foreground">{formatBRL(earningsCents(report.totalSeconds, valid))}</span>
        </div>
      )}
    </section>
  );
}

function FixDialog({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const fix = useMutation({
    mutationFn: () => {
      const iso = localInputToIso(value);
      if (!session || iso <= session.started_at) throw new Error("A saída precisa ser depois da entrada.");
      if (new Date(iso) > new Date()) throw new Error("A saída não pode ser no futuro.");
      return endSession(session.id, iso);
    },
    onSuccess: () => { toast.success("Saída registrada."); qc.invalidateQueries(); onClose(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });
  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-2xl">Informar horário de saída</DialogTitle></DialogHeader>
        {session && <p className="text-lg">Entrada: {fmtDate(session.started_at)} às {fmtTime(session.started_at)}</p>}
        <input type="datetime-local" className="w-full rounded-2xl border-2 border-input px-4 py-4 text-xl" value={value} onChange={(e) => setValue(e.target.value)} />
        <button disabled={!value || fix.isPending} onClick={() => fix.mutate()} className="btn-giant btn-start !min-h-16 !text-xl">SALVAR SAÍDA</button>
      </DialogContent>
    </Dialog>
  );
}
