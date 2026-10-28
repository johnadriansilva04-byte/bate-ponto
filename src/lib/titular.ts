// Dados cadastrais do titular exclusivo do aplicativo. Fixos no codigo porque
// este app atende uma unica pessoa, em um unico aparelho, sem login: nao ha
// outra conta possivel, e o nome/CPF entram no lacre de integridade de cada
// sessao (ver ws_hash no banco).
//
// Para corrigir qualquer dado, edite aqui e rode a migration/setup de novo.
export const TITULAR = {
  nome: "JOÃO DE JESUS DO ROSÁRIO",
  cpf: "927.036.319-87",
  nascimento: "06/06/1972",
} as const;

/** CPF so com digitos, como entra no hash. */
export const cpfDigitos = TITULAR.cpf.replace(/\D/g, "");
