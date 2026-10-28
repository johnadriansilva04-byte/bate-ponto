// Troca do local de trabalho. Fica atras de um botao na tela inicial, porque
// muda raramente. Nao apaga nada: o local antigo continua nos registros antigos
// e a troca entra no log de auditoria com motivo, de onde veio e para onde foi.

import { useEffect, useState } from "react";
import { Loader2, MapPin, LocateFixed } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchWorkplace, saveWorkplace } from "@/lib/sessions-api";
import { formatCoords, getPosition } from "@/lib/geo";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function WorkplaceDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [motivo, setMotivo] = useState("");
  const [raio, setRaio] = useState("300");
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [marcando, setMarcando] = useState(false);

  // Ao abrir, ja mostra o local em vigor, para ele so corrigir o que mudou.
  useEffect(() => {
    if (!open) return;
    setErro(null);
    setMotivo("");
    setSalvando(false);
    setMarcando(false);
    void fetchWorkplace()
      .then((w) => {
        setNome(w?.nome ?? "Local de trabalho");
        setEndereco(w?.endereco ?? "");
        setRaio(String(w?.raioMetros ?? 300));
        setCoord(
          w && w.latitude !== null && w.longitude !== null
            ? { lat: w.latitude, lng: w.longitude }
            : null,
        );
      })
      .catch(() => setErro("Não deu para carregar o local atual."));
  }, [open]);

  // "Usar o local onde estou agora": evita digitar numero de coordenada.
  const marcarAqui = async () => {
    if (marcando) return;
    setMarcando(true);
    setErro(null);
    const fix = await getPosition();
    setMarcando(false);
    if (fix.status !== "ok" || fix.latitude === null || fix.longitude === null) {
      setErro("Não deu para ler o GPS agora. Confira a permissão de local e tente de novo.");
      return;
    }
    setCoord({ lat: fix.latitude, lng: fix.longitude });
  };

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const metros = Number(raio);
      await saveWorkplace(nome, endereco, motivo, {
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
        raioMetros: Number.isFinite(metros) && metros > 0 ? Math.round(metros) : 300,
      });
      await qc.invalidateQueries({ queryKey: ["workplace"] });
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const pronto = endereco.trim().length >= 5 && motivo.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md gap-5 overflow-y-auto border-2 border-primary bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl font-extrabold">
            <MapPin className="h-7 w-7 text-primary" /> Local de trabalho
          </DialogTitle>
          <DialogDescription className="text-lg font-bold text-foreground">
            Só mude quando trocar de lugar. O motivo fica registrado.
          </DialogDescription>
        </DialogHeader>

        <label className="space-y-2">
          <span className="text-lg font-bold">Nome do lugar</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Local de trabalho"
            className="min-h-14 w-full rounded-2xl border-2 border-input bg-background px-4 text-lg text-foreground"
          />
        </label>

        <label className="space-y-2">
          <span className="text-lg font-bold">Endereço</span>
          <input
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            placeholder="AV MAURO RAMOS 765, CENTRO, FLORIANÓPOLIS - SC"
            className="min-h-14 w-full rounded-2xl border-2 border-input bg-background px-4 text-lg text-foreground"
          />
        </label>

        {/* Coordenada do local previsto: e ela que faz o aviso "fora do local"
            funcionar. Sem coordenada, o aplicativo nunca acusa ninguem. */}
        <div className="space-y-2 rounded-2xl border-2 border-border bg-background p-4">
          <p className="text-lg font-bold">Localização deste endereço</p>
          <p className="text-base text-muted-foreground">
            {coord
              ? formatCoords(coord.lat, coord.lng)
              : "Sem coordenada — o aviso de local não vai funcionar."}
          </p>
          <button
            type="button"
            onClick={() => void marcarAqui()}
            disabled={marcando}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-card px-4 text-lg font-bold text-foreground disabled:opacity-50"
          >
            {marcando ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" /> Lendo o GPS…
              </>
            ) : (
              <>
                <LocateFixed className="h-6 w-6" /> Usar o local onde estou agora
              </>
            )}
          </button>
          <p className="text-base text-muted-foreground">
            Fique no local de trabalho e toque no botão. Se preferir, não mexa: sem coordenada, o
            ponto nunca é marcado como fora do lugar.
          </p>
        </div>

        <label className="space-y-2">
          <span className="text-lg font-bold">Distância tolerada (metros)</span>
          <input
            value={raio}
            onChange={(e) => setRaio(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="300"
            className="min-h-14 w-full rounded-2xl border-2 border-input bg-background px-4 text-lg text-foreground"
          />
          <span className="block text-base text-muted-foreground">
            Até essa distância, o ponto conta como no lugar. Sugestão: 300 metros.
          </span>
        </label>

        <label className="space-y-2">
          <span className="text-lg font-bold">Motivo da troca</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: mudou de obra"
            className="min-h-14 w-full rounded-2xl border-2 border-input bg-background px-4 text-lg text-foreground"
          />
        </label>

        {erro && (
          <p
            role="alert"
            className="rounded-2xl bg-destructive px-4 py-3 text-lg font-bold text-destructive-foreground"
          >
            {erro}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="min-h-16 flex-1 rounded-2xl border-2 border-input bg-background text-lg font-bold text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={!pronto || salvando}
            className="min-h-16 flex-1 rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground disabled:opacity-50"
          >
            {salvando ? <Loader2 className="mx-auto h-7 w-7 animate-spin" /> : "SALVAR"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
