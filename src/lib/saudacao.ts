// Saudacoes faladas na tela. Funcoes puras (recebem a hora, devolvem texto) para
// poderem ser testadas sem navegador, como o resto da logica de horas.
//
// O tom e de conversa, curto e em letra grande: quem le e o pai do dono do
// aparelho, com baixa visao, e o aplicativo deve soar como uma pessoa falando
// com ele, nao como um sistema.

/** "Bom dia" / "Boa tarde" / "Boa noite", pela hora local de Sao Paulo. */
export function saudacaoDoDia(hora: number): string {
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** Cumprimento da tela inicial: "Bom dia, João!". */
export function cumprimento(nome: string, hora: number): string {
  return `${saudacaoDoDia(hora)}, ${nome}!`;
}

/** Mensagem ao INICIAR o turno. */
export function bomTrabalho(nome: string): string {
  return `Bom trabalho, ${nome}!`;
}

/** Mensagem ao FINALIZAR o turno. */
export function bomDescanso(nome: string): string {
  return `Bom descanso, ${nome}!`;
}
