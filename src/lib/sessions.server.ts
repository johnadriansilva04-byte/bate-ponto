// Server-only data access. Uses the service-role client, which never reaches
// the browser: the app itself has no login, so the database is reachable only
// through these functions.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Session } from "./hours";

const SESSION_COLUMNS = "id, started_at, ended_at";

export async function selectOpenSession(): Promise<Session | null> {
  const { data, error } = await supabaseAdmin
    .from("work_sessions")
    .select(SESSION_COLUMNS)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Sessions overlapping a UTC range (includes ones started the day before that cross midnight). */
export async function selectSessionsBetween(fromIso: string, toIso: string): Promise<Session[]> {
  const before = new Date(new Date(fromIso).getTime() - 2 * 86400000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("work_sessions")
    .select(SESSION_COLUMNS)
    .gte("started_at", before)
    .lt("started_at", toIso)
    .order("started_at");
  if (error) throw new Error(error.message);
  return (data ?? []).filter((s) => !s.ended_at || s.ended_at > fromIso || s.started_at >= fromIso);
}

export async function insertStart(): Promise<void> {
  const { error } = await supabaseAdmin.from("work_sessions").insert({});
  // 23505 = an open session already exists: treat as success so we never duplicate.
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function updateEnd(id: string, endedAt?: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("work_sessions")
    .update({ ended_at: endedAt ?? new Date().toISOString() })
    .eq("id", id)
    .is("ended_at", null);
  if (error) throw new Error(error.message);
}

export type MonthRate = {
  hourlyRate: number | null;
  totalSeconds: number;
  daysWorked: number;
  sessionCount: number;
};

export async function selectMonthRate(year: number, month: number): Promise<MonthRate | null> {
  const { data, error } = await supabaseAdmin
    .from("monthly_rates")
    .select("hourly_rate, total_seconds, days_worked, session_count")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    hourlyRate: data.hourly_rate,
    totalSeconds: data.total_seconds,
    daysWorked: data.days_worked,
    sessionCount: data.session_count,
  };
}

export async function upsertMonthRate(input: {
  year: number;
  month: number;
  hourlyRate: number | null;
  totalSeconds: number;
  daysWorked: number;
  sessionCount: number;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("monthly_rates").upsert(
    {
      year: input.year,
      month: input.month,
      hourly_rate: input.hourlyRate,
      total_seconds: input.totalSeconds,
      days_worked: input.daysWorked,
      session_count: input.sessionCount,
    },
    { onConflict: "installation_id,year,month" },
  );
  if (error) throw new Error(error.message);
}
