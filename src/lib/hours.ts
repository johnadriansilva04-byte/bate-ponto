// Pure time/hours logic. All instants are UTC; display uses America/Sao_Paulo.
export const TZ = "America/Sao_Paulo";

export type Session = { id: string; started_at: string; ended_at: string | null };

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

function nextDay(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Splits a closed interval into per-local-day seconds. */
export function splitByDay(startIso: string, endIso: string): { key: string; seconds: number }[] {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const out: { key: string; seconds: number }[] = [];
  if (!(end > start)) return out;
  let cur = start;
  let p = tzParts(new Date(start));
  let day = { y: p.y, m: p.m, d: p.d };
  while (cur < end) {
    const n = nextDay(day.y, day.m, day.d);
    const boundary = localMidnight(n.y, n.m, n.d);
    const segEnd = Math.min(end, boundary);
    out.push({ key: keyOf(day.y, day.m, day.d), seconds: Math.round((segEnd - cur) / 1000) });
    cur = segEnd;
    day = n;
  }
  return out;
}

export function sessionSeconds(s: Session): number | null {
  if (!s.ended_at) return null;
  return Math.max(0, Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000));
}

/** 0 -> "0h", 16200 -> "4h30min", 452700 -> "125h45min". Truncates leftover seconds. */
export function formatDuration(seconds: number): string {
  const totalMin = Math.floor(Math.max(0, seconds) / 60);
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
  seconds: number; // closed time falling on this day
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

/** Month 1-12. Sessions may include any range; only time inside the month counts. */
export function buildMonth(year: number, month: number, sessions: Session[], now = new Date()): MonthReport {
  const perDay = new Map<string, number>();
  const startedOn = new Map<string, Session[]>();
  for (const s of sessions) {
    const k = dayKey(new Date(s.started_at));
    if (!startedOn.has(k)) startedOn.set(k, []);
    startedOn.get(k)!.push(s);
    if (s.ended_at) for (const seg of splitByDay(s.started_at, s.ended_at)) perDay.set(seg.key, (perDay.get(seg.key) ?? 0) + seg.seconds);
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

/** Seconds worked today (closed + running), for the main screen. */
export function todaySeconds(sessions: Session[], now = new Date()): number {
  const k = dayKey(now);
  let t = 0;
  for (const s of sessions) {
    const end = s.ended_at ?? now.toISOString();
    for (const seg of splitByDay(s.started_at, end)) if (seg.key === k) t += seg.seconds;
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
