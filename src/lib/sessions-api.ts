import { localMidnight, monthRangeUtc, type Session } from "./hours";
import {
  endWork,
  getMonthRate,
  getOpenSession,
  getSessionsBetween,
  saveMonthRate,
  startWork,
} from "./sessions.functions";

export const fetchOpenSession = (): Promise<Session | null> => getOpenSession();

export const fetchSessionsBetween = (fromIso: string, toIso: string): Promise<Session[]> =>
  getSessionsBetween({ data: { from: fromIso, to: toIso } });

export const fetchMonth = (y: number, m: number) => {
  const r = monthRangeUtc(y, m);
  return fetchSessionsBetween(r.from, r.to);
};

export const startSession = () => startWork();

export const endSession = (id: string, endedAt?: string) =>
  endWork({ data: endedAt === undefined ? { id } : { id, endedAt } });

/** Hourly rate preserved for a given month's closing, or null when never saved. */
export const fetchRate = (y: number, m: number): Promise<number | null> =>
  getMonthRate({ data: { year: y, month: m } }).then((r) => r?.hourlyRate ?? null);

export const saveRate = (
  y: number,
  m: number,
  rate: number | null,
  totals: { totalSeconds: number; daysWorked: number; sessionCount: number },
) => saveMonthRate({ data: { year: y, month: m, hourlyRate: rate, ...totals } });

/** "2026-05-05T17:30" in São Paulo local time -> ISO UTC */
export function localInputToIso(v: string): string {
  const [date = "", time = "0:0"] = v.split("T");
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  return new Date(localMidnight(y, m, d) + hh * 3600000 + mm * 60000).toISOString();
}
