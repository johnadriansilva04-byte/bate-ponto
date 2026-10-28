import { useEffect, useRef, useState } from "react";
import { Delete, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PIN_LENGTH, pinMessage, type PinResult } from "@/lib/pin";
import { verifyPin } from "@/lib/sessions-api";

type Props = {
  open: boolean;
  /** "iniciar" / "finalizar" / "liberar": muda so o texto, o teclado e o mesmo. */
  action: "iniciar" | "finalizar" | "liberar";
  onCancel: () => void;
  onOk: () => void;
  /**
   * Como conferir a senha. Por padrao, a senha de bater ponto. A tela de
   * aparelho novo passa a propria conferencia, porque ali a senha libera o
   * aparelho em vez de registrar um toque.
   */
  verify?: (pin: string) => Promise<PinResult>;
};

const TITULO: Record<Props["action"], string> = {
  iniciar: "Vai começar a trabalhar?",
  finalizar: "Vai terminar de trabalhar?",
  liberar: "Liberar este aparelho?",
};

/**
 * Teclado de 6 digitos em tela cheia, pensado para ser lido e tocado por quem
 * enxerga com um olho so: botoes enormes, contraste alto, sem texto miudo.
 * A senha nao aparece na tela, so a quantidade de digitos ja digitados.
 *
 * A conferencia e feita no servidor: se a internet cair, avisa e nao deixa
 * passar, em vez de aceitar qualquer coisa so para nao travar.
 */
export function PinPad({ open, action, onCancel, onOk, verify }: Props) {
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<PinResult | null>(null);
  // Espelho do pin em ref: toques rapidos seguidos leem o valor atual em vez do
  // estado do render anterior, que ainda nao foi atualizado, e nao perdem digito.
  const pinRef = useRef("");
  // Mesma razao: impede um novo toque enquanto a senha esta sendo conferida.
  const busyRef = useRef(false);

  const setDigits = (value: string) => {
    pinRef.current = value;
    setPin(value);
  };

  useEffect(() => {
    if (open) {
      setDigits("");
      setError(null);
      busyRef.current = false;
      setChecking(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) void push(e.key);
      else if (e.key === "Backspace") setDigits(pinRef.current.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function push(d: string) {
    if (busyRef.current) return;
    const next = (pinRef.current + d).slice(0, PIN_LENGTH);
    setDigits(next);
    setError(null);
    if (next.length < PIN_LENGTH) return;

    busyRef.current = true;
    setChecking(true);
    const check = verify ?? verifyPin;
    const result = await check(next);
    busyRef.current = false;
    setChecking(false);
    if (result.ok) onOk();
    else {
      setError(result);
      setDigits("");
      if (navigator.vibrate) navigator.vibrate(200);
    }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md gap-5 border-2 border-primary bg-card">
        <DialogHeader>
          <DialogTitle className="text-center text-3xl font-extrabold">
            {TITULO[action]}
          </DialogTitle>
          <DialogDescription className="text-center text-xl font-bold text-foreground">
            Digite a sua senha de 6 números.
          </DialogDescription>
        </DialogHeader>

        {/* Quantos digitos ja foram digitados, sem revelar quais. */}
        <div className="flex justify-center gap-3" aria-label={`${pin.length} de ${PIN_LENGTH} números digitados`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`h-5 w-5 rounded-full border-2 ${
                i < pin.length ? "border-primary bg-primary" : "border-muted-foreground"
              }`}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-destructive px-4 py-3 text-center text-xl font-extrabold text-destructive-foreground">
            {pinMessage(error)}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => void push(k)}
              disabled={checking}
              className="min-h-20 rounded-2xl border-2 border-input bg-background font-display text-4xl font-extrabold text-foreground active:bg-primary active:text-primary-foreground disabled:opacity-50"
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={onCancel}
            className="min-h-20 rounded-2xl border-2 border-input bg-background text-lg font-bold text-muted-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void push("0")}
            disabled={checking}
            className="min-h-20 rounded-2xl border-2 border-input bg-background font-display text-4xl font-extrabold text-foreground active:bg-primary active:text-primary-foreground disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin((p) => p.slice(0, -1))}
            disabled={checking || pin.length === 0}
            aria-label="Apagar o último número"
            className="flex min-h-20 items-center justify-center rounded-2xl border-2 border-input bg-background text-foreground disabled:opacity-40"
          >
            {checking ? <Loader2 className="h-9 w-9 animate-spin" /> : <Delete className="h-9 w-9" />}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
