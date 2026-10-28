// Client-callable endpoints. Each handler runs on the server and lazily imports
// the service-role data layer, so no privileged code or key reaches the bundle.
import { createServerFn } from "@tanstack/react-start";
import { toMonthInput, toMonthRateInput, toRangeInput } from "./validation";

export const getOpenSession = createServerFn({ method: "GET" }).handler(async () => {
  const { selectOpenSession } = await import("./sessions.server");
  return selectOpenSession();
});

export const getSessionsBetween = createServerFn({ method: "GET" })
  .validator(toRangeInput)
  .handler(async ({ data }) => {
    const { selectSessionsBetween } = await import("./sessions.server");
    return selectSessionsBetween(data.from, data.to);
  });

export const getAllSessions = createServerFn({ method: "GET" }).handler(async () => {
  const { selectAllSessions } = await import("./sessions.server");
  return selectAllSessions();
});

export const getTitular = createServerFn({ method: "GET" }).handler(async () => {
  const { selectTitular } = await import("./sessions.server");
  return selectTitular();
});

export const getAllRates = createServerFn({ method: "GET" }).handler(async () => {
  const { selectAllRates } = await import("./sessions.server");
  return selectAllRates();
});

/**
 * Confere a senha de confirmacao no servidor. O aplicativo nunca ve o hash, e a
 * funcao do banco ainda bloqueia por 5 minutos depois de 5 erros seguidos.
 */
export const checkPin = createServerFn({ method: "POST" })
  .validator((data: { pin: string }) => {
    if (typeof data?.pin !== "string" || !/^[0-9]{6}$/.test(data.pin)) {
      throw new Error("A senha tem 6 números.");
    }
    return { pin: data.pin };
  })
  .handler(async ({ data }) => {
    const { verifyPin } = await import("./sessions.server");
    return verifyPin(data.pin);
  });

const geoFields = (d: { lat?: unknown; lng?: unknown; geoStatus?: unknown }) => {
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    // Faixa valida do planeta: descarta valor corrompido em vez de gravar lixo.
    return n;
  };
  const lat = num(d.lat);
  const lng = num(d.lng);
  const valid = lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  return {
    lat: valid ? lat : null,
    lng: valid ? lng : null,
    geoStatus: typeof d.geoStatus === "string" ? d.geoStatus.slice(0, 20) : null,
  };
};

const isIso = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(new Date(v).getTime());

export const startWork = createServerFn({ method: "POST" })
  .validator((data: { at?: string; lat?: number | null; lng?: number | null; geoStatus?: string | null } | undefined) => {
    if (data?.at !== undefined && !isIso(data.at)) throw new Error("Horário inválido.");
    return { at: data?.at, ...geoFields(data ?? {}) };
  })
  .handler(async ({ data }) => {
    const { insertStart } = await import("./sessions.server");
    return insertStart({ startedAt: data.at, lat: data.lat, lng: data.lng, geoStatus: data.geoStatus });
  });

export const endWork = createServerFn({ method: "POST" })
  .validator((data: { id: string; endedAt?: string; lat?: number | null; lng?: number | null; geoStatus?: string | null }) => {
    if (!data?.id) throw new Error("Sessão inválida.");
    if (data.endedAt !== undefined && !isIso(data.endedAt)) throw new Error("Horário inválido.");
    return { id: data.id, endedAt: data.endedAt, ...geoFields(data) };
  })
  .handler(async ({ data }) => {
    const { updateEnd } = await import("./sessions.server");
    return updateEnd({ id: data.id, endedAt: data.endedAt, lat: data.lat, lng: data.lng, geoStatus: data.geoStatus });
  });

/** Correcao com motivo: passa pela funcao do banco, que audita e recalcula o lacre. */
export const correctWork = createServerFn({ method: "POST" })
  .validator((data: { id: string; endedAt: string; reason: string }) => {
    if (!data?.id) throw new Error("Sessão inválida.");
    if (!isIso(data.endedAt)) throw new Error("Horário inválido.");
    if (!data.reason || data.reason.trim().length < 3) throw new Error("Informe o motivo da correção.");
    return { id: data.id, endedAt: data.endedAt, reason: data.reason.trim().slice(0, 300) };
  })
  .handler(async ({ data }) => {
    const { correctEnd } = await import("./sessions.server");
    return correctEnd(data.id, data.endedAt, data.reason);
  });

export const getMonthRate = createServerFn({ method: "GET" })
  .validator(toMonthInput)
  .handler(async ({ data }) => {
    const { selectMonthRate } = await import("./sessions.server");
    return selectMonthRate(data.year, data.month);
  });

export const saveMonthRate = createServerFn({ method: "POST" })
  .validator(toMonthRateInput)
  .handler(async ({ data }) => {
    const { upsertMonthRate } = await import("./sessions.server");
    await upsertMonthRate(data);
  });
