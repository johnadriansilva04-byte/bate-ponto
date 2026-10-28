import { describe, expect, it } from "vitest";
import { PIN_LENGTH, pinMessage, verifyPinOffline } from "./pin";

describe("senha de confirmacao", () => {
  it("aceita a senha certa sem internet", async () => {
    expect(await verifyPinOffline("160817")).toBe(true);
  });

  it("recusa senha errada e formato fora de 6 digitos", async () => {
    expect(await verifyPinOffline("160818")).toBe(false);
    expect(await verifyPinOffline("16081")).toBe(false);
    expect(await verifyPinOffline("abcdef")).toBe(false);
    expect(await verifyPinOffline("")).toBe(false);
  });

  it("explica o motivo ao usuario em linguagem simples", () => {
    expect(pinMessage({ ok: false, motivo: "bloqueado", restantes: 0 })).toMatch(/5 minutos/);
    expect(pinMessage({ ok: false, motivo: "senha_incorreta", restantes: 3 })).toMatch(/3 tentativas/);
    expect(pinMessage({ ok: false, motivo: "senha_incorreta", restantes: 1 })).toMatch(/1 tentativa antes/);
    expect(PIN_LENGTH).toBe(6);
  });
});
