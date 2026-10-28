// Aviso de ponto fora do local previsto.
//
// Nao bloqueia nada: o ponto ja foi registrado com a hora e a coordenada reais.
// Este aviso existe para o titular (e quem conferir a ficha depois) enxergar na
// hora que aquele toque aconteceu longe do lugar de costume.
//
// A tela mostra SEMPRE os dois lugares: o previsto, que veio do cadastro, e o
// registrado, que veio do GPS daquele toque. Sem coordenada nao ha acusacao.

import { useEffect, useState } from "react";
import { MapPinOff } from "lucide-react";
import {
  formatCoords,
  formatDistancia,
  reverseGeocode,
  type GeoFix,
  type LocalPrevisto,
} from "@/lib/geo";

type Props = {
  /** Leitura de GPS do toque que acabou de ser registrado. */
  fix: GeoFix;
  /** Local previsto cadastrado (onde ele costuma trabalhar). */
  previsto: LocalPrevisto;
  /** Distancia medida, em metros. */
  distancia: number;
  /** "entrada" ou "saída", para o texto dizer qual toque foi. */
  toque: "entrada" | "saida";
  /** Fecha o aviso; ele nao some sozinho para dar tempo de ler. */
  onFechar: () => void;
};

export function AvisoForaLocal({ fix, previsto, distancia, toque, onFechar }: Props) {
  // Comeca com as coordenadas, que ja existem, e troca pelo nome do lugar se o
  // servico de nomes responder. Nunca fica em branco esperando a internet.
  const [onde, setOnde] = useState<string>(() => formatCoords(fix.latitude, fix.longitude));
  const [buscando, setBuscando] = useState(true);

  useEffect(() => {
    let vivo = true;
    if (fix.latitude === null || fix.longitude === null) {
      setBuscando(false);
      return;
    }
    void reverseGeocode(fix.latitude, fix.longitude).then((nome) => {
      if (!vivo) return;
      setBuscando(false);
      if (nome) setOnde(nome);
    });
    return () => {
      vivo = false;
    };
  }, [fix.latitude, fix.longitude]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="w-full space-y-4 rounded-3xl border-4 border-destructive bg-destructive p-5 text-left text-destructive-foreground"
    >
      <p className="flex items-center gap-3 text-2xl font-extrabold uppercase">
        <MapPinOff className="h-9 w-9 shrink-0" aria-hidden="true" />
        Ponto fora do local previsto
      </p>

      <div className="space-y-1">
        <p className="text-lg font-bold">
          Você registrou a {toque === "saida" ? "saída" : "entrada"} a{" "}
          <strong>{formatDistancia(distancia)}</strong> do local de trabalho.
        </p>
      </div>

      <div className="rounded-2xl bg-background/95 p-4">
        <p className="text-base font-bold uppercase tracking-wide opacity-80">Local previsto</p>
        <p className="text-xl font-extrabold">{previsto.endereco}</p>
      </div>

      <div className="rounded-2xl bg-background/95 p-4">
        <p className="text-base font-bold uppercase tracking-wide opacity-80">
          Local registrado neste toque
        </p>
        <p className="text-xl font-extrabold">{onde}</p>
        {buscando && (
          <p className="mt-1 text-base font-bold opacity-80">Procurando o nome do lugar…</p>
        )}
      </div>

      <p className="text-lg font-bold">
        O ponto foi salvo normalmente, com a hora e a posição de agora. Nada precisa ser feito.
      </p>

      <button
        type="button"
        onClick={onFechar}
        className="min-h-16 w-full rounded-2xl bg-background px-6 text-lg font-extrabold text-foreground"
      >
        ENTENDI
      </button>
    </div>
  );
}
