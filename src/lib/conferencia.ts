// Comparacao entre o que o banco diz agora e o que foi declarado no codigo.
// Funcao pura: a tela so desenha o resultado.
import type { MarcoIntegridade } from "./integridade";

export type Conferencia = {
  /** A impressao do banco e a mesma declarada? */
  esquemaConfere: boolean;
  /** O ultimo marco gravado no banco aponta para a mesma impressao? */
  marcoConfere: boolean;
  /** Texto curto para o usuario, sem jargao. */
  resumo: string;
  /** Explicacao em uma linha. */
  detalhe: string;
};

export function conferirIntegridade(
  marco: MarcoIntegridade,
  estado: { impressaoEsquema: string; ultimoMarcoImpressao: string | null } | null,
): Conferencia {
  if (!estado) {
    return {
      esquemaConfere: false,
      marcoConfere: false,
      resumo: "Não deu para conferir agora",
      detalhe: "O aplicativo não conseguiu ler o estado do banco.",
    };
  }

  const esquemaConfere = estado.impressaoEsquema === marco.impressaoEsquema;
  const marcoConfere = estado.ultimoMarcoImpressao === marco.impressaoEsquema;

  if (esquemaConfere && marcoConfere) {
    return {
      esquemaConfere: true,
      marcoConfere: true,
      resumo: "Tudo igual ao dia do lançamento",
      detalhe: "A estrutura do banco não mudou desde a data declarada.",
    };
  }

  if (!esquemaConfere) {
    return {
      esquemaConfere: false,
      marcoConfere,
      resumo: "A estrutura do banco mudou",
      detalhe: "A impressão digital de hoje é diferente da declarada no lançamento.",
    };
  }

  return {
    esquemaConfere: true,
    marcoConfere: false,
    resumo: "Estrutura igual, mas sem marco gravado",
    detalhe: "A estrutura confere; falta registrar o marco no banco.",
  };
}
