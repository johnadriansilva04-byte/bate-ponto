// Identificacao do aparelho. Nao e dado pessoal: e um codigo aleatorio que o
// proprio navegador cria e guarda, so para o servidor saber quais aparelhos
// estao liberados. Se o titular limpar os dados do navegador, o codigo se
// perde e o aparelho e liberado de novo com a senha — sem perder os registros,
// que ficam no banco.

const KEY = "meuponto.aparelho.v1";

/** Codigo novo, aleatorio, no formato aceito pelo banco. */
function novoCodigo(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Navegador antigo sem getRandomValues: Math.random serve, pois este codigo
    // nao e segredo — a protecao real e a senha conferida no servidor.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `ap-${hex}`;
}

/** Codigo deste aparelho, criado na primeira abertura. */
export function deviceId(): string {
  try {
    const salvo = localStorage.getItem(KEY);
    if (salvo && /^[A-Za-z0-9-]{16,64}$/.test(salvo)) return salvo;
    const novo = novoCodigo();
    localStorage.setItem(KEY, novo);
    return novo;
  } catch {
    // Sem localStorage (modo restrito): codigo so desta sessao.
    return novoCodigo();
  }
}
