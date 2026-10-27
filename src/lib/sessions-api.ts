import { supabase } from "@/integrations/supabase/client";
import { localMidnight, monthRangeUtc, type Session } from "./hours";

export async function fetchOpenSession(): Promise<Session | null> {
  const { data, error } = await supabase
    .from("work_sessions")
    .select("id, started_at, ended_at")
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Sessions overlapping a UTC range (includes ones started the day before that cross midnight). */
export async function fetchSessionsBetween(fromIso: string, toIso: string): Promise<Session[]> {
  const before = new Date(new Date(fromIso).getTime() - 2 * 86400000).toISOString();
  const { data, error } = await supabase
    .from("work_sessions")
    .select("id, started_at, ended_at")
    .gte("started_at", before)
    .lt("started_at", toIso)
    .order("started_at");
  if (error) throw error;
  return (data ?? []).filter((s) => !s.ended_at || s.ended_at > fromIso || s.started_at >= fromIso);
}

export const fetchMonth = (y: number, m: number) => {
  const r = monthRangeUtc(y, m);
  return fetchSessionsBetween(r.from, r.to);
};

export async function startSession() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sem login");
  const { error } = await supabase.from("work_sessions").insert({ user_id: u.user.id });
  // 23505 = já existe sessão aberta: tratamos como sucesso (sem duplicar)
  if (error && error.code !== "23505") throw error;
}

export async function endSession(id: string, endedAt?: string) {
  const { error } = await supabase
    .from("work_sessions")
    .update({ ended_at: endedAt ?? new Date().toISOString() })
    .eq("id", id)
    .is("ended_at", null);
  if (error) throw error;
}

export async function fetchRate(): Promise<number | null> {
  const { data, error } = await supabase.from("user_settings").select("hourly_rate").maybeSingle();
  if (error) throw error;
  return data?.hourly_rate ?? null;
}

export async function saveRate(rate: number | null) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sem login");
  const { error } = await supabase.from("user_settings").upsert({ user_id: u.user.id, hourly_rate: rate });
  if (error) throw error;
}

/** "2026-05-05T17:30" in São Paulo local time -> ISO UTC */
export function localInputToIso(v: string): string {
  const [date, time] = v.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(localMidnight(y, m, d) + hh * 3600000 + mm * 60000).toISOString();
}
