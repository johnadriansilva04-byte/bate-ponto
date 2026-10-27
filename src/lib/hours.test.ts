import { describe, expect, it } from "vitest";
import { buildMonth, earningsCents, formatBRL, formatDuration, splitByDay } from "./hours";

// São Paulo is UTC-3: 08:00 local = 11:00Z
const s = (id: string, a: string, b: string | null) => ({ id, started_at: a, ended_at: b });

describe("hours", () => {
  it("formats durations", () => {
    expect(formatDuration(4 * 3600)).toBe("4h");
    expect(formatDuration(4.5 * 3600)).toBe("4h30min");
    expect(formatDuration(125 * 3600 + 45 * 60)).toBe("125h45min");
  });

  it("splits a session across midnight between days", () => {
    // 22:00 on 31/05 to 02:00 on 01/06 local
    expect(splitByDay("2026-06-01T01:00:00Z", "2026-06-01T05:00:00Z")).toEqual([
      { key: "2026-05-31", seconds: 7200 },
      { key: "2026-06-01", seconds: 7200 },
    ]);
  });

  it("builds May 2026 weeks Monday-Sunday with real day counts", () => {
    const r = buildMonth(2026, 5, []);
    expect(r.weeks[0]!.days.map((d) => d.weekday)).toEqual(["Sex.", "Sáb.", "Dom."]);
    expect(r.weeks.reduce((n, w) => n + w.days.length, 0)).toBe(31);
    expect(buildMonth(2028, 2, []).weeks.reduce((n, w) => n + w.days.length, 0)).toBe(29);
  });

  it("sums days, weeks and month without double counting", () => {
    const sessions = [
      s("a", "2026-05-05T11:00:00Z", "2026-05-05T15:00:00Z"), // 4h
      s("b", "2026-05-05T16:00:00Z", "2026-05-05T20:30:00Z"), // 4h30
      s("c", "2026-05-06T11:15:00Z", "2026-05-06T15:15:00Z"), // 4h
      s("d", "2026-06-01T01:00:00Z", "2026-06-01T05:00:00Z"), // 2h in May, 2h in June
    ];
    const may = buildMonth(2026, 5, sessions);
    const day5 = may.weeks.flatMap((w) => w.days).find((d) => d.day === 5)!;
    expect(day5.seconds).toBe(8.5 * 3600);
    expect(may.totalSeconds).toBe(14.5 * 3600);
    expect(may.weeks.reduce((n, w) => n + w.seconds, 0)).toBe(may.totalSeconds);
    expect(may.sessionCount).toBe(4);
    expect(may.daysWorked).toBe(3);
    expect(buildMonth(2026, 6, sessions).totalSeconds).toBe(2 * 3600);
  });

  it("does not invent exit for open sessions", () => {
    const r = buildMonth(2026, 5, [s("x", "2026-05-05T11:00:00Z", null)]);
    expect(r.totalSeconds).toBe(0);
    expect(r.incomplete).toHaveLength(1);
  });

  it("calculates earnings with minutes: 125h30min x R$20 = R$2.510,00", () => {
    const cents = earningsCents(125.5 * 3600, 20);
    expect(cents).toBe(251000);
    expect(formatBRL(cents).replace(/\s/g, " ")).toBe("R$ 2.510,00");
  });
});
