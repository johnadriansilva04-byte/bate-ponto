import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Fingerprint, ShieldAlert, ShieldCheck } from "lucide-react";
import { fetchIntegrityState } from "@/lib/sessions-api";
import { MARCO_ATUAL, impressaoCurta } from "@/lib/integridade";
import { conferirIntegridade } from "@/lib/conferencia";
import { FINALIDADE } from "@/lib/finalidade";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/**
 * Conferencia de integridade. Fica recolhida: e uma prova para guardar e
 * conferir quando precisar, nao para ocupar a tela no dia a dia. Abre em
 * "Detalhes" — o resumo (se esta tudo igual) ja aparece fechado.
 *
 * Nunca bloqueia nada: so informa. O objetivo e dar ao titular um codigo que
 * ele possa fotografar e guardar fora do celular.
 */
export function ProvaIntegridade() {
  const q = useQuery({
    queryKey: ["integridade"],
    queryFn: fetchIntegrityState,
    staleTime: 60_000,
  });
  const c = conferirIntegridade(MARCO_ATUAL, q.data ?? null);
  const confere = c.esquemaConfere && c.marcoConfere;

  return (
    <section className="mt-6 rounded-3xl border-2 border-border bg-card p-6 shadow-soft">
      <h3 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
        <Fingerprint className="h-7 w-7 text-primary" /> Prova de integridade
      </h3>

      <div
        className={`mt-4 flex items-start gap-3 rounded-2xl p-4 ${
          confere ? "bg-accent" : "border-2 border-destructive bg-card"
        }`}
      >
        {confere ? (
          <ShieldCheck className="mt-1 h-7 w-7 shrink-0 text-accent-foreground" />
        ) : (
          <ShieldAlert className="mt-1 h-7 w-7 shrink-0 text-destructive" />
        )}
        <div>
          <p
            className={`text-xl font-extrabold ${confere ? "text-accent-foreground" : "text-destructive"}`}
          >
            {c.resumo}
          </p>
          <p className="text-base text-muted-foreground">{c.detalhe}</p>
        </div>
      </div>

      {/* Finalidade vem antes dos numeros: sem ela, o codigo nao significa nada. */}
      <div className="mt-4 rounded-2xl bg-secondary p-4">
        <p className="font-bold text-foreground">Para que serve este registro</p>
        <p className="mt-2 text-base text-muted-foreground">{FINALIDADE.proposito}</p>
      </div>

      <Collapsible>
        <CollapsibleTrigger className="mt-4 flex w-full items-center justify-between rounded-2xl bg-secondary px-4 py-3 text-left font-bold text-foreground">
          Detalhes técnicos e o que ele prova
          <ChevronDown className="h-6 w-6" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-4">
          <dl className="space-y-3 border-t pt-4 text-base">
            <div>
              <dt className="font-bold">Declarado em</dt>
              <dd className="text-muted-foreground">{MARCO_ATUAL.declaradoEm}</dd>
            </div>
            <div>
              <dt className="font-bold">Impressão do banco (declarada)</dt>
              <dd className="font-mono break-all text-muted-foreground">
                {MARCO_ATUAL.impressaoEsquema}
              </dd>
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
                nº {MARCO_ATUAL.ancoraId} ·{" "}
                {q.data?.ultimoMarcoEm ? "registrado" : "não registrado"}
              </dd>
            </div>
          </dl>

          <div className="rounded-2xl bg-secondary p-4">
            <p className="font-bold text-foreground">O que ele prova</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-muted-foreground">
              {FINALIDADE.oQueProva.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-3 font-bold text-foreground">O que ele não prova</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-muted-foreground">
              {FINALIDADE.oQueNaoProva.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>

          <p className="rounded-2xl bg-secondary p-4 text-base text-muted-foreground">
            Guarde este código fora do celular (pode ser uma foto). Se algum dia alguém alterar a
            estrutura do banco, este número muda — e comparar com a sua foto mostra a diferença. O
            Supabase também guarda um registro próprio de toda alteração feita no banco, com data e
            hora.
          </p>
          <p className="text-sm text-muted-foreground">
            Conferência: {impressaoCurta(MARCO_ATUAL.impressaoEsquema)} — marco nº{" "}
            {MARCO_ATUAL.ancoraId}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
