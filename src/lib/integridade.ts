// ============================================================================
// DECLARACAO DE INTEGRIDADE — leia antes de alterar qualquer coisa.
//
// A finalidade deste registro esta declarada em src/lib/finalidade.ts e gravada
// no banco (migration 0009, tabela public.declaracao_finalidade): instruir pedido
// de reconhecimento judicial de tempo trabalhado, por erro no registro civil que
// trocou o nome do titular. Este arquivo cuida da parte tecnica dessa prova.
//
// Este arquivo e o "recado" datado do projeto: registra quando esta versao foi
// lancada, qual impressao digital o banco tinha, e onde ficam as provas
// externas que sustentam a afirmacao. Ele NAO e um mecanismo de seguranca —
// e um registro de conferencia. A protecao real esta no banco (migration
// 0008) e nos logs do Supabase.
//
// ---------------------------------------------------------------------------
// O QUE FOI DECLARADO
// ---------------------------------------------------------------------------
// Em 28/10/2026, a estrutura do banco foi conferida e congelada. A partir
// dessa data, qualquer alteracao de estrutura (nova coluna, funcao trocada,
// trigger removido, indice criado) faz `public.schema_fingerprint()` devolver
// um valor diferente do que esta aqui. A conferencia e feita pela tela e pela
// ficha de ponto; nada trava o aplicativo por causa disso.
//
// ---------------------------------------------------------------------------
// COMO CONFERIR (qualquer pessoa, sem pedir permissao)
// ---------------------------------------------------------------------------
//   1. Rode no banco:      select public.schema_fingerprint();
//      Compare com MARCO_ZERO.impressaoEsquema abaixo. Se for igual, a
//      estrutura esta exatamente como foi lancada.
//   2. Rode:               select * from public.integrity_state();
//      Traz a impressao atual, o topo da corrente de lacres e o ultimo marco.
//   3. Confira os logs:    Supabase → Logs → Postgres.
//      O Supabase registra TODO comando DDL executado, com data e usuario
//      (log_statement = 'ddl'). A aplicacao da migration 0008 aparece la, com
//      a hora exata. Nenhum ALTER posterior pode ser escondido desse log.
//
// ---------------------------------------------------------------------------
// O QUE ESTA PROVA GARANTE — E O QUE NAO GARANTE
// ---------------------------------------------------------------------------
// GARANTE: que a estrutura do banco nao mudou desde a data declarada. Se
// alguem trocar o corpo de ws_hash ou remover o trigger ws_01_guard, a
// impressao muda e a diferenca aparece. Tambem garante que o lacre de cada
// sessao continua batendo com a cadeia (session_hash_valid).
//
// NAO GARANTE: que alguem com a chave do banco nao tenha reescrito os dados E
// criado um marco novo. Isso e impossivel de impedir por software — quem
// controla o banco controla os hashes. O que essa pessoa NAO consegue apagar e
// o log de DDL do Supabase, que e mantido pela plataforma, fora do banco.
// Comparar o marco com esse log e a prova de verdade.
//
// Esta limitacao foi verificada empiricamente: nesta mesma data, um teste
// reescreveu uma sessao antiga, recalculou a corrente inteira, e o lacre
// interno respondeu "tudo certo". So a comparacao com um valor guardado FORA
// do banco revelou a alteracao.
// ============================================================================

export type MarcoIntegridade = {
  /** Data do lancamento, no fuso de Sao Paulo (DD/MM/AAAA HH:mm). */
  declaradoEm: string;
  /** Instante UTC exato, para conferir com o log do Supabase. */
  declaradoEmUtc: string;
  /** Versao do aplicativo no momento da declaracao. */
  versao: string;
  /** Impressao digital do schema public, calculada por public.schema_fingerprint(). */
  impressaoEsquema: string;
  /** Id do marco gravado em public.integrity_anchors (somente-insercao). */
  ancoraId: number;
  /** De onde vem a prova externa, independente do banco. */
  prova: string;
};

/**
 * Marco zero: a primeira declaracao. Nao se edita este valor — para declarar
 * uma mudanca, acrescente um novo objeto ao array e registre um novo marco no
 * banco com `insert into public.integrity_anchors ...`.
 */
export const MARCOS: readonly MarcoIntegridade[] = [
  {
    declaradoEm: "28/10/2026 04:35",
    declaradoEmUtc: "2026-10-28T07:35:29Z",
    versao: "1.0.0",
    impressaoEsquema: "ca3f33dd9ac1f1fc94c53de6c24b1007c7026ad240b5a55f1e75a973d76e3e2c",
    ancoraId: 1,
    prova: "Supabase → Logs → Postgres (log_statement='ddl'), migration 0008 aplicada em 2026-10-28T07:35:29Z",
  },
  {
    declaradoEm: "28/10/2026 04:38",
    declaradoEmUtc: "2026-10-28T07:38:37Z",
    versao: "1.0.0",
    // Corrige o marco 1: a impressao cobria o corpo das funcoes sem normalizar
    // espacos e comentarios, entao reexecutar o setup.sql (que deve ser
    // idempotente) mudava o valor so por formatacao. Agora e estavel.
    impressaoEsquema: "a96febd225347ede407261927ca727070286a26e5260963ccb53a7361620203f",
    ancoraId: 2,
    prova: "Supabase → Logs → Postgres (log_statement='ddl'), marco 2 gravado em 2026-10-28T07:38:37Z",
  },
  {
    declaradoEm: "28/10/2026 05:16",
    declaradoEmUtc: "2026-10-28T08:16:05Z",
    versao: "1.0.0",
    // A declaracao de finalidade (migration 0009) acrescentou tabela, funcao e
    // trigger, entao a impressao mudou. Nao se edita o marco 2: registra-se
    // este, para que o historico mostre que a estrutura mudou DE PROPOSITO,
    // na data, e nao por alteracao silenciosa.
    impressaoEsquema: "6293e0a2a4e5245029441e4eaa78db8258b5e2ab8b4a0b95c707715824a4eaec",
    ancoraId: 3,
    prova: "Supabase → Logs → Postgres (log_statement='ddl'), marco 3 gravado em 2026-10-28T08:16:05Z, com a migration 0009 (declaracao de finalidade) aplicada no mesmo instante",
  },
  {
    declaradoEm: "28/10/2026 07:14",
    declaradoEmUtc: "2026-10-28T10:14:17Z",
    versao: "1.0.0",
    // Este marco nao declara mudanca de estrutura: a impressao e IDENTICA a do
    // marco 3, de proposito. Ele registra um teste que foi feito e desfeito no
    // banco (ver a nota gravada em integrity_anchors, id 5), para que o
    // historico mostre o que houve em vez de esconder. A impressao igual e a
    // prova de que a estrutura nao mudou — so o registro do teste ficou.
    impressaoEsquema: "6293e0a2a4e5245029441e4eaa78db8258b5e2ab8b4a0b95c707715824a4eaec",
    ancoraId: 5,
    prova: "Supabase → Logs → Postgres (log_statement='mod'), marco 4 gravado em 2026-10-28T10:14:17Z; o INSERT de teste (id 4, impressao deadbeef, nota TESTE-JOHN) aparece no mesmo log as 10:08:18Z, junto com o DISABLE/DELETE/ENABLE que o removeu as 10:08:58Z",
  },
];

export const MARCO_ZERO: MarcoIntegridade = MARCOS[0]!;

/** O marco em vigor: o ultimo declarado. */
export const MARCO_ATUAL: MarcoIntegridade = MARCOS[MARCOS.length - 1]!;

/** Texto curto para o rodape e a ficha de ponto. */
export const marcoLabel = `Integridade conferida em ${MARCO_ATUAL.declaradoEm} (marco nº ${MARCO_ATUAL.ancoraId})`;

/** Mostra so o comeco do codigo: o suficiente para conferir a olho. */
export const impressaoCurta = (v: string) => `${v.slice(0, 16)}…`;
