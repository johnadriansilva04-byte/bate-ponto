import { describe, expect, it } from "vitest";
import { buildMonth, earningsCents, formatBRL, formatDuration, runningSeconds, sessionSeconds, todaySeconds } from "./hours";

// São Paulo is UTC-3: 08:00 local = 11:00Z
const s = (id: string, a: string, b: string | null) => ({ id, started_at: a, ended_at: b });

describe("hours", () => {
  it("formats durations", () => {
    expect(formatDuration(4 * 3600)).toBe("4h");
    expect(formatDuration(4.5 * 3600)).toBe("4h30min");
    expect(formatDuration(125 * 3600 + 45 * 60)).toBe("125h45min");
  });

  it("never returns a negative duration, even if timestamps are inverted", () => {
    expect(sessionSeconds(s("x", "2026-05-05T15:00:00Z", "2026-05-05T11:00:00Z"))).toBe(0);
    expect(runningSeconds(s("x", "2030-01-01T00:00:00Z", null), new Date("2026-05-05T00:00:00Z"))).toBe(0);
  });

  it("attributes a midnight-crossing session entirely to its start day", () => {
    // 22:00 on 31/05 to 02:00 on 01/06 local = 4h, all of it on 31/05.
    const sessions = [s("a", "2026-06-01T01:00:00Z", "2026-06-01T05:00:00Z")];
    const may = buildMonth(2026, 5, sessions);
    const day31 = may.weeks.flatMap((w) => w.days).find((d) => d.day === 31)!;
    expect(day31.seconds).toBe(4 * 3600);
    expect(may.totalSeconds).toBe(4 * 3600);
    // June must not receive a single second from that session.
    expect(buildMonth(2026, 6, sessions).totalSeconds).toBe(0);
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
    ];
    const may = buildMonth(2026, 5, sessions);
    const day5 = may.weeks.flatMap((w) => w.days).find((d) => d.day === 5)!;
    expect(day5.seconds).toBe(8.5 * 3600);
    expect(may.totalSeconds).toBe(12.5 * 3600);
    expect(may.weeks.reduce((n, w) => n + w.seconds, 0)).toBe(may.totalSeconds);
    expect(may.sessionCount).toBe(3);
    expect(may.daysWorked).toBe(2);
  });

  it("does not invent exit for open sessions", () => {
    const r = buildMonth(2026, 5, [s("x", "2026-05-05T11:00:00Z", null)]);
    expect(r.totalSeconds).toBe(0);
    expect(r.incomplete).toHaveLength(1);
  });

  it("counts today's whole sessions, including a running one", () => {
    const now = new Date("2026-05-05T18:00:00Z");
    const sessions = [
      s("a", "2026-05-05T11:00:00Z", "2026-05-05T15:00:00Z"), // 4h closed
      s("b", "2026-05-05T17:00:00Z", null), // running for 1h
      s("c", "2026-05-04T11:00:00Z", "2026-05-04T20:00:00Z"), // yesterday: ignored
    ];
    expect(todaySeconds(sessions, now)).toBe(5 * 3600);
  });

  it("calculates earnings with minutes: 125h30min x R$20 = R$2.510,00", () => {
    const cents = earningsCents(125.5 * 3600, 20);
    expect(cents).toBe(251000);
    expect(formatBRL(cents).replace(/\s/g, " ")).toBe("R$ 2.510,00");
  });

  it("never rounds half an hour up to a full hour", () => {
    // 30 min at R$20/h is exactly R$10,00, not R$20,00.
    expect(earningsCents(30 * 60, 20)).toBe(1000);
    // 1 min at R$60/h is exactly R$1,00.
    expect(earningsCents(60, 60)).toBe(100);
  });
});
