import { localMidnight, monthRangeUtc, type Session } from "./hours";
import type { GeoFix } from "./geo";
import { verifyPinOffline, type PinResult } from "./pin";
import { deviceId } from "./device";
import {
  authorizeDevice,
  changeWorkplace,
  checkDevice,
  checkPin,
  correctWork,
  endWork,
  getAllRates,
  getAllSessions,
  getMonthRate,
  getOpenSession,
  getSessionsBetween,
  getTitular,
  getWorkplace,
  getWorkplaceHistory,
  saveMonthRate,
  startWork,
} from "./sessions.functions";

export type StartOutcome = { ok: boolean; session: Session | null };

export const fetchOpenSession = (): Promise<Session | null> => getOpenSession();

export const fetchSessionsBetween = (fromIso: string, toIso: string): Promise<Session[]> =>
  getSessionsBetween({ data: { from: fromIso, to: toIso } });

export const fetchMonth = (y: number, m: number) => {
  const r = monthRangeUtc(y, m);
  return fetchSessionsBetween(r.from, r.to);
};

/** Todo o periodo registrado, para a ficha de ponto completa. */
export const fetchAllSessions = (): Promise<Session[]> => getAllSessions();

/** Nome e CPF do titular, gravados no cadastro da instalacao. */
export const fetchTitular = () => getTitular();

/** Valor da hora de cada mes fechado, para somar no periodo completo. */
export const fetchAllRates = () => getAllRates();

/**
 * Confere a senha de confirmacao. O servidor decide sempre que responde; o hash
 * local so entra quando o aparelho esta sem internet, para nao travar quem esta
 * trabalhando sem sinal. Nesse caso o toque entra na fila e sobe depois.
 */
export const verifyPin = async (pin: string): Promise<PinResult> => {
  try {
    return await checkPin({ data: { pin } });
  } catch {
    if (await verifyPinOffline(pin)) return { ok: true, motivo: "ok", restantes: 0 };
    return { ok: false, motivo: "sem_conexao", restantes: 0 };
  }
};

const geoArgs = (geo?: GeoFix) => ({
  lat: geo?.latitude ?? null,
  lng: geo?.longitude ?? null,
  geoStatus: geo?.status ?? null,
});

/** Never throws: a network failure is reported as ok:false so the caller can queue the tap. */
export async function startSession(at?: string, geo?: GeoFix): Promise<StartOutcome> {
  try {
    const result = await startWork({ data: { ...(at ? { at } : {}), ...geoArgs(geo) } });
    return { ok: true, session: result.session };
  } catch {
    return { ok: false, session: null };
  }
}

/** Never throws: returns false when the server could not record the exit. */
export async function endSession(id: string, endedAt?: string, geo?: GeoFix): Promise<boolean> {
  try {
    return await endWork({ data: { id, ...(endedAt === undefined ? {} : { endedAt }), ...geoArgs(geo) } });
  } catch {
    return false;
  }
}

/** Correcao com motivo. Nunca lanca: a tela mostra a mensagem devolvida. */
export async function fixSession(id: string, endedAt: string, reason: string): Promise<string | null> {
  try {
    await correctWork({ data: { id, endedAt, reason } });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Não foi possível corrigir.";
  }
}

/** Hourly rate preserved for a given month's closing, or null when never saved. */
export const fetchRate = (y: number, m: number): Promise<number | null> =>
  getMonthRate({ data: { year: y, month: m } }).then((r) => r?.hourlyRate ?? null);

export const saveRate = (
  y: number,
  m: number,
  rate: number | null,
  totals: { totalSeconds: number; daysWorked: number; sessionCount: number },
) => saveMonthRate({ data: { year: y, month: m, hourlyRate: rate, ...totals } });

/** Estado deste aparelho: liberado ou precisa da senha. */
export const fetchDeviceState = () => checkDevice({ data: { device: deviceId() } });

/** Libera este aparelho com a mesma senha usada para bater o ponto. */
export const authorizeThisDevice = (pin: string) =>
  authorizeDevice({ data: { device: deviceId(), pin } });

/** Local de trabalho em uso agora. */
export const fetchWorkplace = () => getWorkplace();

/** Troca o local de trabalho, com motivo. */
export const saveWorkplace = (
  nome: string,
  endereco: string,
  reason: string,
  local?: { lat: number | null; lng: number | null; raioMetros: number },
) =>
  changeWorkplace({
    data: {
      nome,
      endereco,
      reason,
      lat: local?.lat ?? null,
      lng: local?.lng ?? null,
      raioMetros: local?.raioMetros ?? 300,
    },
  });

/** Histórico das trocas de local. */
export const fetchWorkplaceHistory = () => getWorkplaceHistory();

/** "2026-05-05T17:30" in São Paulo local time -> ISO UTC */
export function localInputToIso(v: string): string {
  const [date = "", time = "0:0"] = v.split("T");
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  return new Date(localMidnight(y, m, d) + hh * 3600000 + mm * 60000).toISOString();
}
