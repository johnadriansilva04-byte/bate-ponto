// Por que o aplicativo não conseguiu falar com o servidor.
//
// Regra de honestidade: a tela nunca culpa a internet de quem usa quando o
// celular TEM internet. O erro pode ser do servidor (banco fora do ar, chave
// ausente, projeto suspenso) — e mandar a pessoa "ligar a internet" faz ela
// mexer no que não está quebrado. Função pura, para poder ser testada.

export type EstadoFalha = "offline" | "servidor";

export type MensagemFalha = {
  titulo: string;
  detalhe: string;
  acao: string;
};

/**
 * `navigator.onLine === false` é sinal confiável de aparelho sem rede. Já
 * `true` não garante internet de verdade, mas quando o servidor falha com o
 * aparelho conectado, a causa está do lado do servidor — não do usuário.
 */
export function classificarFalha(aparelhoOnline: boolean): EstadoFalha {
  return aparelhoOnline ? "servidor" : "offline";
}

export function mensagemFalha(estado: EstadoFalha): MensagemFalha {
  if (estado === "offline") {
    return {
      titulo: "Sem internet",
      detalhe: "Ligue a internet do celular e toque no botão.",
      acao: "TENTAR DE NOVO",
    };
  }
  return {
    titulo: "O servidor não respondeu",
    detalhe:
      "O celular está com internet, mas o aplicativo não conseguiu falar com o servidor. Toque no botão para tentar de novo.",
    acao: "TENTAR DE NOVO",
  };
}
