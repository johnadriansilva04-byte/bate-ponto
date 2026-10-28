import { Fragment } from "react";
import { fmtDate, fmtTime, formatBRL, formatDuration, sessionSeconds, type Session } from "@/lib/hours";
import { formatCoords, geoLabel } from "@/lib/geo";
import { TITULAR } from "@/lib/titular";
import { BUILD } from "@/lib/version";
import { MARCO_ATUAL } from "@/lib/integridade";

export type FichaPeriodo = { rotulo: string; de: string | null; ate: string | null };

type Props = {
  sessions: Session[];
  periodo: FichaPeriodo;
  valorHora: number | null;
  totalSeconds: number;
  diasTrabalhados: number;
  nome: string;
  cpf: string;
  /** Local de trabalho em vigor, mostrado na qualificacao do documento. */
  localTrabalho?: string | null;
};

const linha = (s: Session) => ({
  data: fmtDate(s.started_at),
  entrada: fmtTime(s.started_at),
  saida: s.ended_at ? fmtTime(s.ended_at) : "em aberto",
  duracao: s.ended_at ? formatDuration(sessionSeconds(s) ?? 0) : "—",
  gps: `${formatCoords(s.start_latitude, s.start_longitude)} → ${formatCoords(s.end_latitude, s.end_longitude)}`,
  geo: s.start_geo_status === "ok" && s.end_geo_status === "ok" ? "" : geoLabel(s.end_geo_status ?? s.start_geo_status),
  hash: s.session_hash ?? "—",
  local: s.workplace_label ?? null,
});

/**
 * Ficha de ponto em folha A4. Fica escondida na tela e so aparece na impressao
 * (ou no "Salvar como PDF"), com fundo branco porque papel e branco.
 */
export function FichaPonto({ sessions, periodo, valorHora, totalSeconds, diasTrabalhados, nome, cpf, localTrabalho }: Props) {
  const valorTotal = valorHora !== null ? (totalSeconds / 3600) * valorHora : null;
  const emitidoEm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  return (
    <div className="ficha hidden print:block">
      <header className="ficha-head">
        <h1>FICHA DE PONTO</h1>
        <p className="ficha-sub">Registro de jornada de trabalho — autônomo</p>
      </header>

      <section className="ficha-qualif">
        <p>
          <strong>Trabalhador:</strong> {nome || TITULAR.nome}
        </p>
        <p>
          <strong>CPF:</strong> {cpf || TITULAR.cpf}
        </p>
        <p>
          <strong>Local de trabalho:</strong> {localTrabalho ?? "não informado"}
        </p>
        <p>
          <strong>Período:</strong> {periodo.rotulo}
        </p>
        <p>
          <strong>Documento emitido em:</strong> {emitidoEm}
        </p>
      </section>

      <table className="ficha-tab">
        <thead>
          <tr>
            <th>Dia</th>
            <th>Entrada</th>
            <th>Saída</th>
            <th>Duração</th>
            <th>Coordenadas GPS (entrada → saída)</th>
            <th>Lacre SHA-256</th>
          </tr>
        </thead>
        <tbody>
          {sessions.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center" }}>
                Nenhum registro no período.
              </td>
            </tr>
          )}
          {sessions.map((s) => {
            const l = linha(s);
            return (
              <Fragment key={s.id}>
                <tr>
                  <td>{l.data}</td>
                  <td>{l.entrada}</td>
                  <td>{l.saida}</td>
                  <td>{l.duracao}</td>
                  <td className="ficha-gps">{l.gps}</td>
                  <td className="ficha-hash">{l.hash}</td>
                </tr>
                {l.geo && (
                  <tr>
                    <td colSpan={6} className="ficha-obs">
                      Observação de localização: {l.geo}.
                    </td>
                  </tr>
                )}
                {l.local && l.local !== localTrabalho && (
                  <tr>
                    <td colSpan={6} className="ficha-obs">
                      Local de trabalho registrado: {l.local}.
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <section className="ficha-totais">
        <p>
          <strong>Dias trabalhados:</strong> {diasTrabalhados}
        </p>
        <p>
          <strong>Total de horas:</strong> {formatDuration(totalSeconds)}
        </p>
        <p>
          <strong>Valor da hora:</strong> {valorHora !== null ? formatBRL(Math.round(valorHora * 100)) : "não informado"}
        </p>
        <p>
          <strong>Valor total a receber:</strong>{" "}
          {valorTotal !== null ? formatBRL(Math.round(valorTotal * 100)) : "—"}
        </p>
      </section>

      <section className="ficha-nota">
        <p>
          Cada linha desta ficha traz um código de integridade SHA-256 calculado no servidor sobre os horários e as
          coordenadas do respectivo registro. Qualquer alteração posterior no conteúdo muda o código, o que permite
          verificar a autenticidade do documento.
        </p>
        <p>
          <strong>Declaração de integridade:</strong> em {MARCO_ATUAL.declaradoEm}, a estrutura do banco de dados foi
          conferida e congelada com a impressão digital {MARCO_ATUAL.impressaoEsquema} (marco nº {MARCO_ATUAL.ancoraId}).
          O Supabase mantém um registro próprio de toda alteração feita no banco, com data e hora, que pode ser
          consultado no painel do projeto.
        </p>
      </section>

      <section className="ficha-assin">
        <div>
          <span />
          <p>{nome || TITULAR.nome}</p>
          <small>Trabalhador — CPF {cpf || TITULAR.cpf}</small>
        </div>
        <div>
          <span />
          <p>Tomador de serviços</p>
          <small>Nome / CPF / CNPJ</small>
        </div>
      </section>

      <footer className="ficha-foot">
        Versão Exclusiva — Última Modificação: {BUILD.modificadoEm}
      </footer>
    </div>
  );
}
