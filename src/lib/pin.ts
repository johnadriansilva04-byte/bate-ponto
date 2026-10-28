// Senha de confirmacao do titular (6 digitos). Nao e login: o aplicativo nao
// tem contas, e-mail nem perfis. E um travao de confirmacao, exigido a cada
// INICIAR e a cada FINALIZAR, para que ninguem que pegue o celular consiga
// registrar ponto no lugar dele.
//
// Quem confere e o SERVIDOR (funcao pin_verify no banco, com bcrypt e bloqueio
// apos 5 erros). So quando o aparelho esta sem internet a conferencia cai na
// reserva local abaixo, para nao travar quem esta trabalhando sem sinal: nesse
// caso o toque vai para a fila e sobe depois, com a hora em que foi dado.
//
// A reserva local e mais fraca de proposito: o hash fica no aplicativo. Ela
// nunca vale quando o servidor responde.

export const PIN_LENGTH = 6;

export type PinResult = {
  ok: boolean;
  motivo: "ok" | "senha_incorreta" | "bloqueado" | "formato_invalido" | "sem_conexao";
  restantes: number;
};

// Reserva local (PBKDF2-SHA256), usada somente sem internet.
const SALT = "meuponto:instalacao-unica:v1";
const ITERATIONS = 210_000;
const LENGTH_BITS = 256;
const STORED = "06496cdbc496eeddab8a9fc2015d10e3733ef8d422b7a6ceeaf8e84cf72afd08";

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** Comparacao sem parar no primeiro digito diferente. */
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPinOffline(pin: string): Promise<boolean> {
  if (!/^\d{6}$/.test(pin)) return false;
  // Navegador antigo pode nao ter crypto.subtle (so existe em contexto seguro).
  // Sem ele nao ha como conferir aqui; quem decide volta a ser o servidor.
  if (typeof crypto === "undefined" || !crypto.subtle) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(SALT), iterations: ITERATIONS, hash: "SHA-256" },
      key,
      LENGTH_BITS,
    );
    return sameHash(toHex(bits), STORED);
  } catch {
    return false;
  }
}

/** Mensagem curta para a tela, a partir do motivo devolvido pelo servidor. */
export function pinMessage(r: PinResult): string {
  switch (r.motivo) {
    case "bloqueado":
      return "Muitas tentativas erradas. Espere 5 minutos e tente de novo.";
    case "senha_incorreta":
      return r.restantes > 0
        ? `Senha errada. ${r.restantes} tentativa${r.restantes > 1 ? "s" : ""} antes de bloquear.`
        : "Senha errada.";
    case "sem_conexao":
      return "Senha errada. Tente de novo.";
    default:
      return "Digite os 6 números da sua senha.";
  }
}
