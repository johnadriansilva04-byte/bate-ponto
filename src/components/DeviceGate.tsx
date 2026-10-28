// Validacao do aparelho. Nao e login: nao ha conta, e-mail nem senha propria.
// E a mesma senha de 6 numeros que ele ja usa para bater o ponto, pedida uma
// unica vez, quando o aplicativo e aberto num celular que ainda nao foi
// liberado. O primeiro aparelho entra sozinho, para nao trancar o titular fora
// na propria instalacao.

import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, Smartphone, WifiOff } from "lucide-react";
import { authorizeThisDevice, fetchDeviceState } from "@/lib/sessions-api";
import type { PinResult } from "@/lib/pin";
import { PinPad } from "@/components/PinPad";

type Estado = "checando" | "liberado" | "precisa_senha" | "sem_internet";

/** Botao principal: grande, verde, impossivel de errar. */
const BOTAO = "min-h-20 w-full rounded-2xl bg-primary px-6 font-display text-2xl font-extrabold text-primary-foreground shadow-button active:translate-y-1";

export function DeviceGate({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>("checando");
  const [erro, setErro] = useState<string | null>(null);
  // O teclado so aparece depois do toque, para a tela nao abrir cheia de botoes
  // sem explicacao. "Cancelar" volta para esta tela, nao fica reabrindo.
  const [pedindo, setPedindo] = useState(false);

  const checar = async () => {
    setErro(null);
    setEstado("checando");
    try {
      const r = await fetchDeviceState();
      if (r.conhecido) {
        setEstado("liberado");
        return;
      }
      if (r.total === 0) {
        // Primeiro aparelho: entra sozinho, mas precisa ser GRAVADO na lista.
        // Sem gravar, todo aparelho novo continuaria sendo tratado como o
        // primeiro e a trava nunca passaria a valer.
        const novo = await authorizeThisDevice("");
        setEstado(novo.ok ? "liberado" : "precisa_senha");
        return;
      }
      setEstado("precisa_senha");
    } catch {
      setEstado("sem_internet");
    }
  };

  useEffect(() => {
    void checar();
  }, []);

  // Liberado (ou primeiro aparelho): segue direto para a tela de bater ponto.
  if (estado === "liberado") return <>{children}</>;

  if (estado === "checando") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-14 w-14 animate-spin text-primary" />
        <p className="text-2xl font-bold">Abrindo…</p>
      </div>
    );
  }

  if (estado === "sem_internet") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <WifiOff className="h-16 w-16 text-warning" />
        <h1 className="font-display text-3xl font-extrabold text-foreground">Sem internet</h1>
        <p className="text-xl">Ligue a internet do celular e toque no botão.</p>
        <button onClick={() => void checar()} className={BOTAO}>
          TENTAR DE NOVO
        </button>
      </div>
    );
  }

  // Aparelho novo: uma senha, uma vez, e ele entra na lista de liberados.
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 text-center">
      <Smartphone className="h-16 w-16 text-primary" />
      <h1 className="font-display text-4xl font-extrabold text-primary">Celular novo</h1>

      {/* Uma ideia por linha, em letra grande. Nada de paragrafo longo. */}
      <div className="w-full space-y-3 text-xl">
        <p>Este aplicativo é só seu.</p>
        <p className="font-bold">Agora ele vai liberar este celular.</p>
      </div>

      <div className="w-full rounded-2xl bg-accent p-4 text-lg text-accent-foreground">
        <p className="flex items-center justify-center gap-2 font-bold">
          <Check className="h-6 w-6" /> Você digita a senha só uma vez.
        </p>
        <p className="mt-1">Depois este celular abre direto, sem pedir nada.</p>
      </div>

      {erro && (
        <p role="alert" className="w-full rounded-2xl border-4 border-destructive bg-destructive px-4 py-4 text-xl font-bold text-destructive-foreground">
          {erro}
        </p>
      )}

      <button
        onClick={() => {
          setErro(null);
          setPedindo(true);
        }}
        className={BOTAO}
      >
        DIGITAR A SENHA
      </button>
      <p className="text-lg text-muted-foreground">
        É a mesma senha de 6 números que você já usa para bater o ponto.
      </p>

      <PinPad
        open={pedindo}
        action="liberar"
        onCancel={() => setPedindo(false)}
        onOk={() => setEstado("liberado")}
        verify={async (pin): Promise<PinResult> => {
          try {
            const r = await authorizeThisDevice(pin);
            if (!r.ok && r.motivo !== "senha_incorreta") setErro("Não foi possível liberar. Tente de novo.");
            return r;
          } catch {
            setErro("Sem internet. Confira a conexão e tente de novo.");
            return { ok: false, motivo: "sem_conexao", restantes: 0 };
          }
        }}
      />
    </div>
  );
}
