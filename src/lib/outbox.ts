// Offline outbox. A tap is written to localStorage first, then replayed to the
// server. The exact tap time travels with the event, so a punch made with no
// internet keeps the real clock time instead of the moment it synced.
import { endSession, startSession } from "./sessions-api";
import type { Session } from "./hours";
import type { GeoFix } from "./geo";

const KEY = "meuponto.outbox.v1";

export type PendingEvent =
  | { kind: "start"; at: string; lat?: number | null; lng?: number | null; geoStatus?: string | null }
  | { kind: "end"; id: string | null; at: string; lat?: number | null; lng?: number | null; geoStatus?: string | null };

type Stored = PendingEvent[];

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Stored) : [];
  } catch {
    return [];
  }
}

function write(events: Stored) {
  try {
    if (events.length) localStorage.setItem(KEY, JSON.stringify(events));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage full or blocked: the caller still reports the failure honestly.
  }
}

export const pendingEvents = (): Stored => read();
export const hasPending = (): boolean => read().length > 0;

export function queue(event: PendingEvent) {
  write([...read(), event]);
}

/**
 * Sends queued events in order. A "start" that the server already has (unique
 * index violation) is treated as done, so replays never duplicate a session.
 * Returns true only when the queue is empty afterwards.
 */
export async function flush(): Promise<boolean> {
  const events = read();
  if (!events.length) return true;

  const remaining: Stored = [];
  let openId: string | null = null;

  for (const [i, ev] of events.entries()) {
    const geo = { latitude: ev.lat ?? null, longitude: ev.lng ?? null, status: (ev.geoStatus ?? "indisponivel") as GeoFix["status"], accuracy: null };
    if (ev.kind === "start") {
      const result = await startSession(ev.at, geo);
      if (!result.ok) {
        remaining.push(...events.slice(i));
        break;
      }
      openId = result.session?.id ?? openId;
    } else {
      let id = ev.id ?? openId;
      if (!id) {
        // The matching start was lost: recover whatever the server has open.
        const { fetchOpenSession } = await import("./sessions-api");
        id = (await fetchOpenSession())?.id ?? null;
      }
      if (!id) {
        remaining.push(ev);
        continue;
      }
      const ok = await endSession(id, ev.at, geo);
      if (!ok) {
        remaining.push(...events.slice(i));
        break;
      }
    }
  }

  write(remaining);
  return remaining.length === 0;
}

export function clearQueue() {
  write([]);
}
