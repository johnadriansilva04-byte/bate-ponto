import { beforeEach, describe, expect, it, vi } from "vitest";

const startSession = vi.fn();
const endSession = vi.fn();
const fetchOpenSession = vi.fn();

vi.mock("./sessions-api", () => ({
  startSession: (...a: unknown[]) => startSession(...a),
  endSession: (...a: unknown[]) => endSession(...a),
  fetchOpenSession: (...a: unknown[]) => fetchOpenSession(...a),
}));

const { queue, flush, pendingEvents, clearQueue } = await import("./outbox");

describe("outbox", () => {
  beforeEach(() => {
    localStorage.clear();
    startSession.mockReset();
    endSession.mockReset();
    fetchOpenSession.mockReset();
  });

  it("keeps the tap time so an offline punch is not re-dated on sync", async () => {
    const at = "2026-05-05T11:00:00.000Z";
    queue({ kind: "start", at });
    expect(pendingEvents()).toEqual([{ kind: "start", at }]);

    startSession.mockResolvedValue({ ok: true, session: { id: "s1", started_at: at, ended_at: null } });
    expect(await flush()).toBe(true);
    // O GPS sem sinal viaja como "indisponivel", sem inventar coordenada.
    expect(startSession).toHaveBeenCalledWith(at, { latitude: null, longitude: null, status: "indisponivel", accuracy: null });
    expect(pendingEvents()).toEqual([]);
  });

  it("stops at the first failure and keeps the rest queued", async () => {
    queue({ kind: "start", at: "2026-05-05T11:00:00.000Z" });
    queue({ kind: "end", id: "s1", at: "2026-05-05T15:00:00.000Z" });

    startSession.mockResolvedValue({ ok: true, session: { id: "s1", started_at: "2026-05-05T11:00:00.000Z", ended_at: null } });
    endSession.mockResolvedValue(false);

    expect(await flush()).toBe(false);
    expect(pendingEvents()).toHaveLength(1);
    expect(pendingEvents()[0]).toMatchObject({ kind: "end" });
  });

  it("uses the start that succeeded when the end has no id", async () => {
    queue({ kind: "start", at: "2026-05-05T11:00:00.000Z" });
    queue({ kind: "end", id: null, at: "2026-05-05T15:00:00.000Z" });

    startSession.mockResolvedValue({ ok: true, session: { id: "made", started_at: "2026-05-05T11:00:00.000Z", ended_at: null } });
    endSession.mockResolvedValue(true);

    expect(await flush()).toBe(true);
    expect(endSession).toHaveBeenCalledWith("made", "2026-05-05T15:00:00.000Z", { latitude: null, longitude: null, status: "indisponivel", accuracy: null });
  });

  it("recovers the open session from the server when the id was lost", async () => {
    queue({ kind: "end", id: null, at: "2026-05-05T15:00:00.000Z" });
    fetchOpenSession.mockResolvedValue({ id: "server-open", started_at: "2026-05-05T11:00:00.000Z", ended_at: null });
    endSession.mockResolvedValue(true);

    expect(await flush()).toBe(true);
    expect(endSession).toHaveBeenCalledWith("server-open", "2026-05-05T15:00:00.000Z", { latitude: null, longitude: null, status: "indisponivel", accuracy: null });
  });

  it("treats a duplicated start as success instead of queueing it forever", async () => {
    queue({ kind: "start", at: "2026-05-05T11:00:00.000Z" });
    // The server already had an open session: it returns it, no error.
    startSession.mockResolvedValue({ ok: true, session: { id: "existing", started_at: "2026-05-05T10:00:00.000Z", ended_at: null } });

    expect(await flush()).toBe(true);
    expect(pendingEvents()).toEqual([]);
    expect(clearQueue).toBeTypeOf("function");
  });
});
