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

export const startWork = createServerFn({ method: "POST" }).handler(async () => {
  const { insertStart } = await import("./sessions.server");
  await insertStart();
});

export const endWork = createServerFn({ method: "POST" })
  .validator((data: { id: string; endedAt?: string }) => {
    if (!data?.id) throw new Error("Sessão inválida.");
    if (data.endedAt !== undefined && Number.isNaN(new Date(data.endedAt).getTime())) {
      throw new Error("Horário inválido.");
    }
    return { id: data.id, endedAt: data.endedAt };
  })
  .handler(async ({ data }) => {
    const { updateEnd } = await import("./sessions.server");
    await updateEnd(data.id, data.endedAt);
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
