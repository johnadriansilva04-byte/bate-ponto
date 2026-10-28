// ============================================================================
// DECLARACAO DE FINALIDADE — por que este aplicativo existe.
//
// Leia este arquivo antes de alterar qualquer coisa. Ele nao e codigo: e o
// registro do proposito. Se voce chegou aqui para "limpar", "simplificar" ou
// "refatorar", entenda primeiro o que este registro significa para a pessoa que
// o usa, e nao apague o proposito junto com o codigo.
//
// ---------------------------------------------------------------------------
// PARA QUE SERVE
// ---------------------------------------------------------------------------
// Este aplicativo registra horas de trabalho de UMA pessoa — o titular — para
// instruir um pedido de reconhecimento judicial de tempo trabalhado.
//
// O titular sofreu um erro no registro civil: seu nome foi alterado de
// "JOAO DE JESUS DO ROSARIO" para "JOAO DE DEUS DO ROSARIO". Enquanto a
// correcao tramita, os documentos dele nao conferem com o nome pelo qual ele
// trabalha e recebe. Sem vinculo formal registrado, ele presta servico sem
// comprovante de jornada.
//
// O que existe para provar esse tempo:
//   - os PIX recebidos, que mostram pagamento por trabalho, mas nao jornada;
//   - este aplicativo, que registra a jornada dia a dia, com hora de entrada,
//     hora de saida e coordenada de onde o toque foi dado.
//
// A finalidade declarada e permitir que a Justica, ao final do processo,
// reconheca o tempo efetivamente trabalhado, com base em registro datado,
// encadeado e verificavel — nao em memoria ou em estimativa.
//
// ---------------------------------------------------------------------------
// O QUE O REGISTRO PROVA (e o que nao prova)
// ---------------------------------------------------------------------------
// PROVA, por matematica, que:
//   - cada sessao tem hora de entrada e de saida gravadas no instante do toque;
//   - a duracao e a diferenca exata entre as duas, em segundos;
//   - cada registro carrega um SHA-256 calculado DENTRO do banco (nao pelo
//     aplicativo) sobre horarios, coordenadas e identidade do titular;
//   - cada registro se encadeia ao anterior pelo hash, formando uma corrente:
//     alterar um registro antigo quebra todos os seguintes;
//   - a estrutura do banco tem impressao digital conferivel contra um marco
//     datado, guardado em tabela somente-insercao.
//
// NAO PROVA, e e honesto dizer:
//   - que o titular estava trabalhando naquele instante (o registro prova o
//     toque, nao o trabalho);
//   - que ninguem com a chave do banco reescreveu tudo e criou um marco novo.
//     Contra isso vale o log do Supabase, mantido pela plataforma fora do banco.
//
// Um registro que promete mais do que entrega vale menos em juizo. Este vale o
// que diz: hora, lugar, encadeamento e verificabilidade matematica.
//
// ---------------------------------------------------------------------------
// POR QUE OS LOGS DO SUPABASE IMPORTAM
// ---------------------------------------------------------------------------
// O lacre por sessao e interno ao banco. Quem controla o banco controla os
// hashes. Por isso a prova se apoia tambem em algo de fora: o Supabase registra
// toda alteracao de estrutura (DDL) com data, hora e usuario, num log que o
// aplicativo nao alcanca. Aplicar uma migration deixa rastro ali. Comparar o
// marco declarado aqui com esse log externo e o que da fe externa ao registro.
//
// LIMITE TECNICO CONHECIDO (medido em 28/10/2026, nao suposto):
//   - o log do Supabase guarda cerca de 24 horas no plano em uso (medido: as
//     consultas param de retornar linhas acima de 24h de janela; o projeto foi
//     criado em 28/10/2026 02:22 UTC e todo o historico cabia na janela);
//   - portanto o log serve para auditoria RECENTE, nao historica;
//   - escritas feitas pelo aplicativo (PostgREST, protocolo estendido) so
//     aparecem no log do Postgres se log_min_duration_statement estiver em 0;
//     com o padrao, registra-se apenas a requisicao HTTP (metodo, rota, status);
//   - para valor probatorio de longo prazo, exporte os registros periodicamente
//     (ficha em PDF assinada, e o proprio banco em backup externo). Nao dependa
//     do log do Supabase como arquivo historico.
//
// Este arquivo NAO substitui prova documental, testemunhal ou pericial. Ele
// descreve o que o sistema faz, para que o que ele produz possa ser conferido.
// ============================================================================

/**
 * Instante em que esta declaracao foi gravada no log externo do Supabase, como
 * comentario seguido de leitura (nao altera dados). O log do Supabase e mantido
 * pela plataforma, fora do banco: e a prova que o aplicativo nao alcanca.
 */
export const REGISTRADA_NO_LOG_EM = "2026-10-28T08:17:46Z";

/** Nome pelo qual o titular trabalha e assina. */
export const NOME_DE_FATO = "JOÃO DE JESUS DO ROSÁRIO";

/** Nome que consta no registro civil, por erro a ser corrigido. */
export const NOME_NO_REGISTRO = "JOÃO DE DEUS DO ROSÁRIO";

export type Finalidade = {
  /** Resumo em uma frase, para cabecalho de documento. */
  resumo: string;
  /** Para que o registro sera usado, em linguagem direta. */
  proposito: string;
  /** O que a prova tecnica sustenta, sem exagero. */
  oQueProva: readonly string[];
  /** O que ela nao sustenta — declarar isso fortalece, nao enfraquece. */
  oQueNaoProva: readonly string[];
  /** Por que o log do Supabase entra como prova externa. */
  provaExterna: string;
  /** Limites tecnicos medidos, para ninguem prometer o que nao existe. */
  limites: readonly string[];
};

export const FINALIDADE: Finalidade = {
  resumo:
    "Registro individual de jornada de trabalho, com hora, local e lacre criptográfico, para instruir pedido de reconhecimento de tempo trabalhado.",
  proposito:
    "O titular trabalha sem vínculo formal e sem comprovante de jornada, porque um erro no registro civil trocou seu nome e os documentos não conferem com o nome pelo qual trabalha e recebe. Enquanto a correção tramita, este aplicativo registra a jornada de cada dia para que o tempo trabalhado possa ser reconhecido e apurado ao final do processo.",
  oQueProva: [
    "Cada sessão tem hora de entrada e de saída gravadas no instante do toque, em horário UTC, exibidas no fuso de São Paulo.",
    "A duração de cada sessão é a diferença exata, em segundos, entre a entrada e a saída — não uma estimativa.",
    "Cada registro carrega um SHA-256 calculado dentro do banco de dados, sobre horários, coordenadas e identidade do titular; o aplicativo não pode escrever esse código.",
    "Os registros se encadeiam: cada lacre inclui o hash do anterior, então alterar um registro antigo quebra a corrente inteira.",
    "A estrutura do banco tem impressão digital conferível contra um marco datado, gravado em tabela somente-inserção.",
  ],
  oQueNaoProva: [
    "Não prova que o titular estava efetivamente trabalhando no instante do toque: prova o toque, no horário e no lugar registrados.",
    "Não é imune a quem tenha a chave do banco: essa pessoa pode reescrever os dados e recalcular a corrente. Contra isso vale o log externo do Supabase, mantido fora do banco.",
    "Não substitui prova documental, testemunhal ou pericial, nem dispensa a correção do registro civil.",
  ],
  provaExterna:
    "O Supabase registra toda alteração de estrutura do banco (DDL) com data, hora e usuário, num log que o aplicativo não alcança nem apaga. Comparar o marco declarado aqui com esse log externo é o que dá fé pública ao registro.",
  limites: [
    "O log do Supabase no plano atual guarda cerca de 24 horas — serve para auditoria recente, não como arquivo histórico.",
    "Escritas do aplicativo só aparecem no log do Postgres com log_min_duration_statement = 0; sem isso, registra-se apenas a requisição HTTP (método, rota e status).",
    "Para valor probatório de longo prazo, exporte periodicamente: ficha em PDF, backup do banco e guarda do código de integridade fora do celular.",
  ],
};
