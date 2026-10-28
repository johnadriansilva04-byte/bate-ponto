import { useEffect, useRef, useState } from "react";
import { Check, Delete, Loader2 } from "lucide-react";
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

/** Instrucao em uma linha, sem jargao, para quem nunca mexeu no celular. */
const AJUDA: Record<Props["action"], string> = {
  iniciar: "Toque nos 6 números da sua senha.",
  finalizar: "Toque nos 6 números da sua senha.",
  liberar: "Toque nos 6 números da sua senha. É a mesma senha de sempre.",
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
  const [done, setDone] = useState(false);
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
      setDone(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) void push(e.key);
      else if (e.key === "Backspace") apagar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /**
   * Apaga o ultimo numero. Precisa mexer no ref tambem: so o estado nao basta,
   * porque o proximo toque le o ref e reintroduziria o digito apagado.
   */
  function apagar() {
    if (busyRef.current) return;
    setDigits(pinRef.current.slice(0, -1));
    setError(null);
  }

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
    if (result.ok) {
      // Confirmacao visual: sem ela, quem digitou o 6o numero nao sabe se deu certo.
      setDone(true);
      onOk();
    } else {
      setError(result);
      setDigits("");
      if (navigator.vibrate) navigator.vibrate(200);
    }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const faltam = PIN_LENGTH - pin.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md gap-5 border-4 border-primary bg-card">
        <DialogHeader>
          <DialogTitle className="text-center text-3xl font-extrabold">
            {TITULO[action]}
          </DialogTitle>
          <DialogDescription className="text-center text-xl font-bold text-foreground">
            {AJUDA[action]}
          </DialogDescription>
        </DialogHeader>

        {/* Quantos digitos ja foram digitados, sem revelar quais. Cada ponto e
            grande e cheio, para ser visto de longe e com um olho so. */}
        <div
          className="flex justify-center gap-3"
          role="status"
          aria-live="polite"
          aria-label={`${pin.length} de ${PIN_LENGTH} números digitados`}
        >
          {Array.from({ length: PIN_LENGTH }, (_, i) => {
            const cheio = i < pin.length;
            return (
              <span
                key={i}
                className={`h-7 w-7 rounded-full border-4 ${
                  cheio ? "border-primary bg-primary" : "border-muted-foreground bg-transparent"
                }`}
              />
            );
          })}
        </div>

        {/* Diz em palavras quantos faltam: quem nao enxerga bem os pontos nao
            fica adivinhando. */}
        {!error && (
          <p className="text-center text-xl font-bold text-foreground">
            {faltam > 0 ? `Faltam ${faltam} ${faltam === 1 ? "número" : "números"}` : "Conferindo…"}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-2xl border-4 border-destructive bg-destructive px-4 py-4 text-center text-xl font-extrabold text-destructive-foreground"
          >
            {pinMessage(error)}
          </p>
        )}

        {done && (
          <p className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-center text-xl font-extrabold text-accent-foreground">
            <Check className="h-7 w-7" /> Senha certa!
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => void push(k)}
              disabled={checking}
              aria-label={`Número ${k}`}
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
            aria-label="Número 0"
            className="min-h-20 rounded-2xl border-2 border-input bg-background font-display text-4xl font-extrabold text-foreground active:bg-primary active:text-primary-foreground disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            onClick={apagar}
            disabled={checking || pin.length === 0}
            aria-label="Apagar o último número"
            className="flex min-h-20 items-center justify-center gap-2 rounded-2xl border-2 border-input bg-background text-foreground disabled:opacity-40"
          >
            {checking ? <Loader2 className="h-9 w-9 animate-spin" /> : <Delete className="h-9 w-9" />}
          </button>
        </div>

        {/* Saida sempre visivel: quem se perde nao fica preso no teclado. */}
        <button
          type="button"
          onClick={onCancel}
          className="min-h-14 w-full rounded-2xl border-2 border-input bg-background text-lg font-bold text-muted-foreground"
        >
          Voltar
        </button>
      </DialogContent>
    </Dialog>
  );
}
