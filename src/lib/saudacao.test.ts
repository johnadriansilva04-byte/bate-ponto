import { describe, expect, it } from "vitest";
import { bomDescanso, bomTrabalho, cumprimento, saudacaoDoDia } from "./saudacao";

describe("saudacaoDoDia", () => {
  it("dá bom dia da manhã até antes do meio-dia", () => {
    expect(saudacaoDoDia(5)).toBe("Bom dia");
    expect(saudacaoDoDia(8)).toBe("Bom dia");
    expect(saudacaoDoDia(11)).toBe("Bom dia");
  });

  it("dá boa tarde do meio-dia até antes das 18h", () => {
    expect(saudacaoDoDia(12)).toBe("Boa tarde");
    expect(saudacaoDoDia(17)).toBe("Boa tarde");
  });

  it("dá boa noite das 18h até antes das 5h", () => {
    expect(saudacaoDoDia(18)).toBe("Boa noite");
    expect(saudacaoDoDia(23)).toBe("Boa noite");
    expect(saudacaoDoDia(0)).toBe("Boa noite");
    expect(saudacaoDoDia(4)).toBe("Boa noite");
  });
});

describe("mensagens com o nome", () => {
  it("cumprimenta pelo nome", () => {
    expect(cumprimento("João", 8)).toBe("Bom dia, João!");
    expect(cumprimento("João", 20)).toBe("Boa noite, João!");
  });

  it("deseja bom trabalho ao iniciar e bom descanso ao finalizar", () => {
    expect(bomTrabalho("João")).toBe("Bom trabalho, João!");
    expect(bomDescanso("João")).toBe("Bom descanso, João!");
  });
});
