// Instalacao no celular. No Android/Chrome o proprio navegador avisa quando o
// aplicativo pode ser instalado (beforeinstallprompt); no iPhone/iPad a Apple
// nao oferece esse aviso, entao mostramos o caminho pelo menu Compartilhar.
// O botao so aparece enquanto o aplicativo nao estiver instalado.

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "meuponto.instalar.oculto";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // iOS expoe isso fora do padrao.
  (window.navigator as unknown as { standalone?: boolean }).standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);
const isAndroid = () => /android/i.test(window.navigator.userAgent);

export function InstallCard() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    setHidden(localStorage.getItem(DISMISS_KEY) === "1");
    setIos(isIos());

    const onPrompt = (e: Event) => {
      // Guarda o aviso para chamar no toque do botao, que e o gesto do usuario.
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || hidden) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
  };

  // Android antigo pode nunca avisar que da para instalar. Nesse caso mostramos
  // o caminho pelo menu do proprio navegador, que sempre existe.
  if (!prompt && !ios && !isAndroid()) return null;

  return (
    <section className="no-print rounded-3xl border-2 border-primary bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-primary">
          <Download className="h-6 w-6" /> INSTALAR NO CELULAR
        </h2>
        <button onClick={dismiss} aria-label="Esconder" className="rounded-xl p-2 text-muted-foreground">
          <X className="h-6 w-6" />
        </button>
      </div>

      {ios ? (
        <p className="mt-2 text-base text-muted-foreground">
          Abra o menu <Share className="inline h-5 w-5" /> <strong>Compartilhar</strong> do Safari, desça e toque em{" "}
          <strong>Adicionar à Tela de Início</strong>. Depois abra pelo ícone, como um aplicativo.
        </p>
      ) : prompt ? (
        <>
          <p className="mt-2 text-base text-muted-foreground">
            Instale para abrir com um toque, sem passar pelo navegador.
          </p>
          <button
            onClick={() => void prompt.prompt()}
            className="mt-3 flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-lg font-extrabold text-primary-foreground"
          >
            <Download className="h-6 w-6" /> INSTALAR AGORA
          </button>
        </>
      ) : (
        // Android sem o aviso automatico (aparelho ou navegador antigo).
        <div className="mt-2 space-y-2 text-base text-muted-foreground">
          <p>Para abrir com um toque, sem passar pelo navegador:</p>
          <ol className="list-decimal space-y-1 pl-6">
            <li>
              Toque nos <strong>três pontinhos</strong> do navegador (canto de cima).
            </li>
            <li>
              Escolha <strong>Adicionar à tela inicial</strong> ou <strong>Instalar aplicativo</strong>.
            </li>
            <li>
              Confirme. O ícone <strong>Meu Ponto</strong> aparece junto dos seus aplicativos.
            </li>
          </ol>
        </div>
      )}
    </section>
  );
}
