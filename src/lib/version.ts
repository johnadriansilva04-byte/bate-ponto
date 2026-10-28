// Marco temporal do codigo, mostrado no rodape. Atualize a data sempre que o
// aplicativo for alterado: e a referencia visivel de qual versao gerou os
// registros e a ficha de ponto.
export const BUILD = {
  /** DD/MM/AAAA HH:mm no fuso de Sao Paulo. */
  modificadoEm: "28/10/2026 05:18",
  versao: "1.0.0",
} as const;

export const buildLabel = `Versão Exclusiva — Última Modificação: ${BUILD.modificadoEm}`;
