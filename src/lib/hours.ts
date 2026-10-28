// Pure time/hours logic. All instants are UTC; display uses America/Sao_Paulo.
export const TZ = "America/Sao_Paulo";

export type Session = {
  id: string;
  started_at: string;
  ended_at: string | null;
  start_latitude?: number | null;
  start_longitude?: number | null;
  end_latitude?: number | null;
  end_longitude?: number | null;
  start_geo_status?: string | null;
  end_geo_status?: string | null;
  recorded_started_at?: string | null;
  recorded_ended_at?: string | null;
  session_hash?: string | null;
  prev_hash?: string | null;
  sealed_at?: string | null;
  titular_nome?: string | null;
  titular_cpf?: string | null;
};

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function tzParts(d: Date) {
  const p: Record<string, number> = {};
  for (const x of partsFmt.formatToParts(d)) if (x.type !== "literal") p[x.type] = Number(x.value);
  const g = (k: string) => p[k] ?? 0;
  return { y: g("year"), m: g("month"), d: g("day"), hh: g("hour"), mm: g("minute"), ss: g("second") };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export function dayKey(date: Date) {
  const p = tzParts(date);
  return keyOf(p.y, p.m, p.d);
}

/** UTC ms of local midnight (America/Sao_Paulo) for a calendar date. */
export function localMidnight(y: number, m: number, d: number): number {
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const p = tzParts(new Date(guess));
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
    const diff = asUtc - Date.UTC(y, m - 1, d);
    if (diff === 0) break;
    guess -= diff;
  }
  return guess;
}

/** Duration of a closed session. Null while it is still open. Never negative. */
export function sessionSeconds(s: Session): number | null {
  if (!s.ended_at) return null;
  return Math.max(0, Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000));
}

/** How long an open session has been running. Never negative. */
export function runningSeconds(s: Session, now = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - new Date(s.started_at).getTime()) / 1000));
}

/** 0 -> "0h", 16200 -> "4h30min", 452700 -> "125h45min". Menos de 1 min vira "45s". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total > 0 && total < 60) return `${total}s`;
  const totalMin = Math.floor(total / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${pad(m)}min`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export const WEEKDAYS = ["Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb.", "Dom."];

/** Monday=0 … Sunday=6 for a calendar date. */
export function weekdayIndex(y: number, m: number, d: number) {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export type DayRow = {
  key: string;
  day: number;
  weekday: string;
  sessions: Session[]; // sessions that STARTED this day
  seconds: number; // closed time attributed to this day (whole sessions)
  isToday: boolean;
};
export type Week = { days: DayRow[]; seconds: number };
export type MonthReport = {
  weeks: Week[];
  totalSeconds: number;
  daysWorked: number;
  sessionCount: number;
  incomplete: Session[];
};

/**
 * Month 1-12. A session counts on the local day it started, in full, so a
 * 23:00 -> 02:00 shift lands entirely on the first day and never splits across
 * days or months. Open sessions are excluded from totals (nothing is invented).
 */
export function buildMonth(year: number, month: number, sessions: Session[], now = new Date()): MonthReport {
  const perDay = new Map<string, number>();
  const startedOn = new Map<string, Session[]>();
  for (const s of sessions) {
    const k = dayKey(new Date(s.started_at));
    if (!startedOn.has(k)) startedOn.set(k, []);
    startedOn.get(k)!.push(s);
    const secs = sessionSeconds(s);
    if (secs !== null) perDay.set(k, (perDay.get(k) ?? 0) + secs);
  }
  const todayKey = dayKey(now);
  const weeks: Week[] = [];
  let cur: Week | null = null;
  let total = 0;
  let daysWorked = 0;
  const monthSessions = new Set<string>();
  const n = daysInMonth(year, month);
  for (let d = 1; d <= n; d++) {
    const wd = weekdayIndex(year, month, d);
    if (!cur || wd === 0) {
      cur = { days: [], seconds: 0 };
      weeks.push(cur);
    }
    const key = keyOf(year, month, d);
    const seconds = perDay.get(key) ?? 0;
    const daySessions = (startedOn.get(key) ?? []).sort((a, b) => a.started_at.localeCompare(b.started_at));
    daySessions.forEach((s) => monthSessions.add(s.id));
    cur.days.push({ key, day: d, weekday: WEEKDAYS[wd] ?? "", sessions: daySessions, seconds, isToday: key === todayKey });
    cur.seconds += seconds;
    total += seconds;
    if (seconds > 0) daysWorked++;
  }
  const incomplete = sessions.filter((s) => !s.ended_at && monthSessions.has(s.id));
  return { weeks, totalSeconds: total, daysWorked, sessionCount: monthSessions.size, incomplete };
}

/** Seconds worked today: whole sessions that started today (plus the open one). */
export function todaySeconds(sessions: Session[], now = new Date()): number {
  const k = dayKey(now);
  let t = 0;
  for (const s of sessions) {
    if (dayKey(new Date(s.started_at)) !== k) continue;
    t += sessionSeconds(s) ?? runningSeconds(s, now);
  }
  return t;
}

/** Earnings in cents, exact to the second. */
export function earningsCents(seconds: number, hourlyRate: number): number {
  return Math.round((seconds * hourlyRate * 100) / 3600);
}

export const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** UTC range covering a local month (for querying). */
export function monthRangeUtc(year: number, month: number) {
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return { from: new Date(localMidnight(year, month, 1)).toISOString(), to: new Date(localMidnight(next.y, next.m, 1)).toISOString() };
}

const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
