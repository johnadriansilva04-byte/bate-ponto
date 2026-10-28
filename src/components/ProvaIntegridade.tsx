import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, Fingerprint } from "lucide-react";
import { fetchIntegrityState } from "@/lib/sessions-api";
import { MARCO_ATUAL, impressaoCurta } from "@/lib/integridade";
import { conferirIntegridade } from "@/lib/conferencia";

/**
 * Conferencia de integridade: mostra a impressao digital do banco e compara com
 * a declarada no lancamento. E informativo — nunca bloqueia nada. O objetivo e
 * dar ao usuario um codigo que ele possa fotografar e guardar fora do celular.
 */
export function ProvaIntegridade() {
  const q = useQuery({
    queryKey: ["integridade"],
    queryFn: fetchIntegrityState,
    staleTime: 60_000,
  });
  const c = conferirIntegridade(MARCO_ATUAL, q.data ?? null);

  return (
    <section className="mt-6 rounded-3xl border-2 border-border bg-card p-6 shadow-soft">
      <h3 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
        <Fingerprint className="h-7 w-7 text-primary" /> Prova de integridade
      </h3>

      <div
        className={`mt-4 flex items-start gap-3 rounded-2xl p-4 ${
          c.esquemaConfere && c.marcoConfere ? "bg-accent" : "border-2 border-destructive bg-card"
        }`}
      >
        {c.esquemaConfere && c.marcoConfere ? (
          <ShieldCheck className="mt-1 h-7 w-7 shrink-0 text-accent-foreground" />
        ) : (
          <ShieldAlert className="mt-1 h-7 w-7 shrink-0 text-destructive" />
        )}
        <div>
          <p
            className={`text-xl font-extrabold ${
              c.esquemaConfere && c.marcoConfere ? "text-accent-foreground" : "text-destructive"
            }`}
          >
            {c.resumo}
          </p>
          <p className="text-base text-muted-foreground">{c.detalhe}</p>
        </div>
      </div>

      <dl className="mt-4 space-y-3 border-t pt-4 text-base">
        <div>
          <dt className="font-bold">Declarado em</dt>
          <dd className="text-muted-foreground">{MARCO_ATUAL.declaradoEm}</dd>
        </div>
        <div>
          <dt className="font-bold">Impressão do banco (declarada)</dt>
          <dd className="font-mono break-all text-muted-foreground">{MARCO_ATUAL.impressaoEsquema}</dd>
        </div>
        <div>
          <dt className="font-bold">Impressão do banco (agora)</dt>
          <dd className="font-mono break-all text-muted-foreground">
            {q.data ? q.data.impressaoEsquema : "lendo…"}
          </dd>
        </div>
        <div>
          <dt className="font-bold">Marco gravado no banco</dt>
          <dd className="text-muted-foreground">
            nº {MARCO_ATUAL.ancoraId} · {q.data?.ultimoMarcoEm ? "registrado" : "não registrado"}
          </dd>
        </div>
      </dl>

      <p className="mt-4 rounded-2xl bg-secondary p-4 text-base text-muted-foreground">
        Guarde este código fora do celular (pode ser uma foto). Se algum dia alguém alterar a estrutura do banco, este
        número muda — e comparar com a sua foto mostra a diferença. O Supabase também guarda um registro próprio de
        toda alteração feita no banco, com data e hora.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Conferência: {impressaoCurta(MARCO_ATUAL.impressaoEsquema)} — marco nº {MARCO_ATUAL.ancoraId}
      </p>
    </section>
  );
}
