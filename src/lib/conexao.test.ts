import { describe, expect, it } from "vitest";
import { classificarFalha, mensagemFalha } from "./conexao";

describe("classificarFalha", () => {
  it("culpa a internet somente quando o aparelho esta mesmo sem rede", () => {
    expect(classificarFalha(false)).toBe("offline");
  });

  it("com o aparelho conectado, a falha e do servidor — nunca do usuario", () => {
    expect(classificarFalha(true)).toBe("servidor");
  });
});

describe("mensagemFalha", () => {
  it("so manda ligar a internet quando o aparelho esta offline", () => {
    const m = mensagemFalha("offline");
    expect(m.titulo).toBe("Sem internet");
    expect(m.detalhe).toContain("Ligue a internet");
  });

  it("quando o servidor falha, nao manda a pessoa mexer na internet", () => {
    const m = mensagemFalha("servidor");
    expect(m.titulo).not.toBe("Sem internet");
    expect(m.detalhe).not.toContain("Ligue a internet");
    expect(m.detalhe).toContain("celular está com internet");
  });
});
