// Input coercion for the server functions. Values arrive from the network, so
// they are validated and normalised here before touching the database.

export type MonthInput = { year: number; month: number };

export function toMonthInput(data: { year: number | string; month: number | string }): MonthInput {
  const year = Number(data.year);
  const month = Number(data.month);
  if (!Number.isInteger(year) || year < 1970 || year > 9999) throw new Error("Ano inválido.");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Mês inválido.");
  return { year, month };
}

export function toRangeInput(data: { from: string; to: string }): { from: string; to: string } {
  const from = new Date(data.from);
  const to = new Date(data.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !(to > from)) {
    throw new Error("Período inválido.");
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export type MonthRateInput = MonthInput & {
  hourlyRate: number | null;
  totalSeconds: number;
  daysWorked: number;
  sessionCount: number;
};

export function toMonthRateInput(data: {
  year: number | string;
  month: number | string;
  hourlyRate: number | string | null;
  totalSeconds: number | string;
  daysWorked: number | string;
  sessionCount: number | string;
}): MonthRateInput {
  const { year, month } = toMonthInput(data);
  const raw = data.hourlyRate;
  let hourlyRate: number | null = null;
  if (raw !== null && raw !== undefined && raw !== "") {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error("Valor da hora inválido.");
    hourlyRate = value;
  }
  const count = (v: number | string) => Math.max(0, Math.floor(Number(v) || 0));
  return {
    year,
    month,
    hourlyRate,
    totalSeconds: count(data.totalSeconds),
    daysWorked: count(data.daysWorked),
    sessionCount: count(data.sessionCount),
  };
}
