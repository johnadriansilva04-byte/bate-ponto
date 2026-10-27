import { describe, expect, it } from "vitest";
import { toMonthInput, toMonthRateInput, toRangeInput } from "./validation";

describe("validation", () => {
  it("accepts a valid month and coerces strings", () => {
    expect(toMonthInput({ year: "2026", month: "5" })).toEqual({ year: 2026, month: 5 });
  });

  it("rejects out-of-range months and years", () => {
    expect(() => toMonthInput({ year: 2026, month: 0 })).toThrow();
    expect(() => toMonthInput({ year: 2026, month: 13 })).toThrow();
    expect(() => toMonthInput({ year: 1800, month: 5 })).toThrow();
  });

  it("normalises a range and rejects inverted or invalid dates", () => {
    expect(toRangeInput({ from: "2026-05-01T03:00:00Z", to: "2026-06-01T03:00:00Z" })).toEqual({
      from: "2026-05-01T03:00:00.000Z",
      to: "2026-06-01T03:00:00.000Z",
    });
    expect(() =>
      toRangeInput({ from: "2026-06-01T03:00:00Z", to: "2026-05-01T03:00:00Z" }),
    ).toThrow();
    expect(() => toRangeInput({ from: "nope", to: "2026-05-01T03:00:00Z" })).toThrow();
  });

  it("treats an empty or absent rate as optional", () => {
    const base = { year: 2026, month: 5, totalSeconds: 451800, daysWorked: 20, sessionCount: 40 };
    expect(toMonthRateInput({ ...base, hourlyRate: "" }).hourlyRate).toBeNull();
    expect(toMonthRateInput({ ...base, hourlyRate: null }).hourlyRate).toBeNull();
    expect(toMonthRateInput({ ...base, hourlyRate: "20" }).hourlyRate).toBe(20);
  });

  it("rejects a negative or non-numeric rate", () => {
    const base = { year: 2026, month: 5, totalSeconds: 0, daysWorked: 0, sessionCount: 0 };
    expect(() => toMonthRateInput({ ...base, hourlyRate: -1 })).toThrow();
    expect(() => toMonthRateInput({ ...base, hourlyRate: "abc" })).toThrow();
  });

  it("clamps negative or malformed totals to zero", () => {
    const r = toMonthRateInput({
      year: 2026,
      month: 5,
      hourlyRate: 20,
      totalSeconds: -5,
      daysWorked: "x",
      sessionCount: 3.9,
    });
    expect(r).toMatchObject({ totalSeconds: 0, daysWorked: 0, sessionCount: 3 });
  });
});
