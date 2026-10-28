// Server-only data access. Uses the service-role client, which never reaches
// the browser: the app itself has no login, so the database is reachable only
// through these functions.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { PinResult } from "./pin";
import type { Session } from "./hours";

// Uma unica string literal: o Supabase infere os tipos a partir dela, e uma
// concatenacao com "+" viraria "string" e derrubaria a checagem de tipos.
const SESSION_COLUMNS =
  "id,started_at,ended_at,start_latitude,start_longitude,end_latitude,end_longitude,start_geo_status,end_geo_status,recorded_started_at,recorded_ended_at,session_hash,prev_hash,sealed_at,titular_nome,titular_cpf,workplace_id,workplace_label" as const;

export type StartResult = { session: Session | null; alreadyOpen: boolean };

/** Todas as sessoes, da mais antiga para a mais nova. Usado na ficha completa. */
export async function selectAllSessions(): Promise<Session[]> {
  const { data, error } = await supabaseAdmin
    .from("work_sessions")
    .select(SESSION_COLUMNS)
    .order("started_at", { ascending: true })
    .limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Identificacao do titular gravada no cadastro (uma linha, sem login). */
export async function selectTitular(): Promise<{ nome: string | null; cpf: string | null; fuso: string }> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("nome, cpf, fuso_horario")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { nome: data?.nome ?? null, cpf: data?.cpf ?? null, fuso: data?.fuso_horario ?? "America/Sao_Paulo" };
}

/** Existing open session, or null. Used both by the UI and by the outbox replay. */
export async function selectOpenSession(): Promise<Session | null> {
  const { data, error } = await supabaseAdmin
    .from("work_sessions")
    .select(SESSION_COLUMNS)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
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

export type StartInput = {
  startedAt?: string | undefined;
  lat?: number | null | undefined;
  lng?: number | null | undefined;
  geoStatus?: string | null | undefined;
};

/**
 * Opens a session at `startedAt` (defaults to now). The partial unique index
 * allows only one open session, so a second attempt returns the existing one
 * instead of failing: the caller never has to reason about duplicates.
 */
export async function insertStart(input: StartInput = {}): Promise<StartResult> {
  const row: TablesInsert<"work_sessions"> = {};
  if (input.startedAt) row.started_at = input.startedAt;
  if (input.lat !== null && input.lat !== undefined) row.start_latitude = input.lat;
  if (input.lng !== null && input.lng !== undefined) row.start_longitude = input.lng;
  if (input.geoStatus) row.start_geo_status = input.geoStatus;

  const { data, error } = await supabaseAdmin
    .from("work_sessions")
    .insert(row)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { session: await selectOpenSession(), alreadyOpen: true };
    throw new Error(error.message);
  }
  return { session: data ?? null, alreadyOpen: false };
}

export type EndInput = {
  id: string;
  endedAt?: string | undefined;
  lat?: number | null | undefined;
  lng?: number | null | undefined;
  geoStatus?: string | null | undefined;
};

/** Closes a session. `endedAt` must be after the start; the database enforces it too. */
export async function updateEnd(input: EndInput): Promise<boolean> {
  const patch: TablesUpdate<"work_sessions"> = { ended_at: input.endedAt ?? new Date().toISOString() };
  if (input.lat !== null && input.lat !== undefined) patch.end_latitude = input.lat;
  if (input.lng !== null && input.lng !== undefined) patch.end_longitude = input.lng;
  if (input.geoStatus) patch.end_geo_status = input.geoStatus;

  const { data, error } = await supabaseAdmin
    .from("work_sessions")
    .update(patch)
    .eq("id", input.id)
    .is("ended_at", null)
    .select(SESSION_COLUMNS);
  if (error) {
    // 23514 = ended_at before started_at; 23505 = the time collides with another session.
    if (error.code === "23514" || error.code === "23505") return false;
    throw new Error(error.message);
  }
  return (data ?? []).length > 0;
}

export type MonthRate = {
  hourlyRate: number | null;
  totalSeconds: number;
  daysWorked: number;
  sessionCount: number;
};

/**
 * Correcao de saida em registro ja lacrado. Chama a funcao do banco, que exige
 * motivo, deixa rastro em session_audit e recalcula o SHA-256. O aplicativo nao
 * pode alterar o lacre por conta propria.
 */
export async function correctEnd(id: string, endedAt: string, reason: string): Promise<boolean> {
  const { error } = await supabaseAdmin.rpc("correct_session_end", {
    p_session_id: id,
    p_new_end: endedAt,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return true;
}

/** Confere se o lacre gravado ainda bate com o conteudo (usado na ficha impressa). */
export async function checkHash(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("session_hash_valid", { p_id: id });
  if (error) return false;
  return data === true;
}

/** Estado de integridade: impressao atual do schema e ultimo marco declarado. */
export type EstadoIntegridade = {
  impressaoEsquema: string;
  topoCorrente: string | null;
  sessoes: number;
  ultimoMarcoEm: string | null;
  ultimoMarcoImpressao: string | null;
};

export async function selectIntegrityState(): Promise<EstadoIntegridade | null> {
  const { data, error } = await supabaseAdmin.rpc("integrity_state");
  if (error) throw new Error(error.message);
  const r = (data ?? [])[0];
  if (!r) return null;
  return {
    impressaoEsquema: r.impressao_esquema,
    topoCorrente: r.topo_corrente,
    sessoes: r.sessoes,
    ultimoMarcoEm: r.ultimo_marco_em,
    ultimoMarcoImpressao: r.ultimo_marco_impressao,
  };
}

/** Todos os fechamentos mensais, para somar o valor no periodo completo. */
export async function selectAllRates(): Promise<{ year: number; month: number; hourlyRate: number | null }[]> {
  const { data, error } = await supabaseAdmin
    .from("monthly_rates")
    .select("year, month, hourly_rate")
    .order("year")
    .order("month");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ year: r.year, month: r.month, hourlyRate: r.hourly_rate }));
}

/** Confere a senha no servidor. Nunca lanca: erro de rede vira 'sem_conexao'. */
export async function verifyPin(pin: string): Promise<PinResult> {
  const { error, data } = await supabaseAdmin.rpc("pin_verify", { p_pin: pin });
  if (error) return { ok: false, motivo: "sem_conexao", restantes: 0 };
  const r = (data ?? {}) as { ok?: boolean; motivo?: string; restantes?: number };
  return {
    ok: r.ok === true,
    motivo: (r.motivo as PinResult["motivo"]) ?? "senha_incorreta",
    restantes: typeof r.restantes === "number" ? r.restantes : 0,
  };
}

export type DeviceState = { conhecido: boolean; total: number; valido: boolean };

/** Este aparelho esta na lista de liberados? */
export async function checkDevice(device: string): Promise<DeviceState> {
  const { data, error } = await supabaseAdmin.rpc("device_check", { p_device: device });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { conhecido?: boolean; total?: number; valido?: boolean };
  return { conhecido: r.conhecido === true, total: r.total ?? 0, valido: r.valido !== false };
}

/** Libera o aparelho. O primeiro entra sem senha; os demais exigem a senha. */
export async function authorizeDevice(device: string, pin: string): Promise<PinResult> {
  const { data, error } = await supabaseAdmin.rpc("device_authorize", { p_device: device, p_pin: pin });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { ok?: boolean; motivo?: string; restantes?: number };
  return {
    ok: r.ok === true,
    motivo: (r.motivo as PinResult["motivo"]) ?? "senha_incorreta",
    restantes: typeof r.restantes === "number" ? r.restantes : 0,
  };
}

export type Workplace = {
  id: string;
  nome: string;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  raioMetros: number;
};

/** Local de trabalho em uso agora, ou null quando nenhum esta ativo. */
export async function selectWorkplace(): Promise<Workplace | null> {
  const { data, error } = await supabaseAdmin.rpc("workplace_current");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    id: string;
    nome: string;
    endereco: string;
    latitude: number | null;
    longitude: number | null;
    raio_metros: number | null;
  }[];
  const w = rows[0];
  if (!w) return null;
  return {
    id: w.id,
    nome: w.nome,
    endereco: w.endereco,
    latitude: w.latitude,
    longitude: w.longitude,
    raioMetros: w.raio_metros ?? 300,
  };
}

/** Troca o local de trabalho: exige motivo e grava no log de auditoria. */
export async function setWorkplace(
  nome: string,
  endereco: string,
  reason: string,
  lat: number | null,
  lng: number | null,
  raioMetros: number,
): Promise<void> {
  // Os tipos gerados usam `exactOptionalPropertyTypes`: a chave so entra quando
  // existe coordenada, em vez de receber undefined.
  const args: { p_nome: string; p_endereco: string; p_reason: string; p_raio: number; p_lat?: number; p_lng?: number } = {
    p_nome: nome,
    p_endereco: endereco,
    p_reason: reason,
    p_raio: raioMetros,
  };
  if (lat !== null && lng !== null) {
    args.p_lat = lat;
    args.p_lng = lng;
  }

  const { error } = await supabaseAdmin.rpc("set_workplace", args);
  if (error) throw new Error(error.message);
}

export type WorkplaceChange = {
  action: string;
  motivo: string | null;
  enderecoAnterior: string | null;
  enderecoNovo: string | null;
  changedAt: string;
};

/** Historico das trocas de local, do mais recente para o mais antigo. */
export async function selectWorkplaceHistory(): Promise<WorkplaceChange[]> {
  const { data, error } = await supabaseAdmin
    .from("workplace_audit")
    .select("action, motivo, endereco_anterior, endereco_novo, changed_at")
    .order("changed_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    action: r.action,
    motivo: r.motivo,
    enderecoAnterior: r.endereco_anterior,
    enderecoNovo: r.endereco_novo,
    changedAt: r.changed_at,
  }));
}

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
