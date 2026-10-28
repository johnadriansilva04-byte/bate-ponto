import { describe, expect, it } from "vitest";
import { conferirIntegridade } from "./conferencia";
import { MARCO_ATUAL, type MarcoIntegridade } from "./integridade";

const marco: MarcoIntegridade = MARCO_ATUAL;

describe("conferirIntegridade", () => {
  it("aprova quando a impressao do banco e a declarada e o marco existe", () => {
    const c = conferirIntegridade(marco, {
      impressaoEsquema: marco.impressaoEsquema,
      ultimoMarcoImpressao: marco.impressaoEsquema,
    });
    expect(c.esquemaConfere).toBe(true);
    expect(c.marcoConfere).toBe(true);
    expect(c.resumo).toBe("Tudo igual ao dia do lançamento");
  });

  it("acusa quando a estrutura do banco mudou", () => {
    const c = conferirIntegridade(marco, {
      impressaoEsquema: "0".repeat(64),
      ultimoMarcoImpressao: "0".repeat(64),
    });
    expect(c.esquemaConfere).toBe(false);
    expect(c.resumo).toBe("A estrutura do banco mudou");
  });

  it("nao acusa quando o banco nao responde", () => {
    const c = conferirIntegridade(marco, null);
    expect(c.esquemaConfere).toBe(false);
    expect(c.marcoConfere).toBe(false);
    expect(c.resumo).toBe("Não deu para conferir agora");
  });

  it("aponta marco ausente quando a estrutura confere mas falta o registro", () => {
    const c = conferirIntegridade(marco, {
      impressaoEsquema: marco.impressaoEsquema,
      ultimoMarcoImpressao: null,
    });
    expect(c.esquemaConfere).toBe(true);
    expect(c.marcoConfere).toBe(false);
  });
});

describe("MARCO_ATUAL", () => {
  it("traz uma impressao SHA-256 valida", () => {
    expect(MARCO_ATUAL.impressaoEsquema).toMatch(/^[0-9a-f]{64}$/);
  });
});
