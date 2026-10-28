import { describe, expect, it } from "vitest";
import { primeiroNome } from "./titular";

describe("primeiroNome", () => {
  it("usa o primeiro nome e ignora os conectivos", () => {
    expect(primeiroNome()).toBe("João");
  });
});
