import { describe, expect, it } from "vitest";
import { FINALIDADE, NOME_DE_FATO, NOME_NO_REGISTRO, REGISTRADA_NO_LOG_EM } from "./finalidade";

describe("declaracao de finalidade", () => {
  it("registra o nome de fato e o nome do registro civil, que divergem por erro", () => {
    expect(NOME_DE_FATO).toBe("JOÃO DE JESUS DO ROSÁRIO");
    expect(NOME_NO_REGISTRO).toBe("JOÃO DE DEUS DO ROSÁRIO");
    expect(NOME_DE_FATO).not.toBe(NOME_NO_REGISTRO);
  });

  it("declara o proposito em linguagem direta, sem prometer mais do que entrega", () => {
    expect(FINALIDADE.proposito).toMatch(/registro civil/i);
    expect(FINALIDADE.proposito).toMatch(/reconhecid/i);
  });

  it("lista o que a prova sustenta e o que nao sustenta", () => {
    // Declarar o limite e o que sustenta a credibilidade do registro.
    expect(FINALIDADE.oQueProva.length).toBeGreaterThanOrEqual(4);
    expect(FINALIDADE.oQueNaoProva.length).toBeGreaterThanOrEqual(2);
  });

  it("nao esconde o limite de retencao do log externo", () => {
    const texto = FINALIDADE.limites.join(" ");
    expect(texto).toMatch(/24 horas/);
    // O usuario precisa saber que o log nao e arquivo historico.
    expect(texto).toMatch(/n[aã]o como arquivo hist[oó]rico/i);
  });

  it("aponta a data em que a declaracao entrou no log externo", () => {
    expect(REGISTRADA_NO_LOG_EM).toMatch(/^2026-10-28T\d{2}:\d{2}:\d{2}Z$/);
  });
});
