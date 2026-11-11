import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { BUILD } from "./lib/version";

// Registro de partida no log do servidor (Vercel → Deployments → Functions).
// Serve para conferir, do lado de fora do celular, QUAL versao esta no ar e
// desde quando. A falha de conexao com o banco aparece logo depois, com o nome
// da funcao que falhou — e e isso que mostra a causa real em vez de "sem
// internet".
console.log(
  `[meu-ponto] servidor iniciado — versão ${BUILD.versao}, código de ${BUILD.modificadoEm}`,
);

// Batimento do banco. O plano gratuito do Supabase PAUSA o projeto depois de
// alguns dias sem uso — e o projeto pausado nao responde, o que aparecia no
// aplicativo como "sem internet". Este endpoint toca o banco de leve e e
// chamado por um cron diario (vercel.json), para o projeto nunca ficar tempo
// suficiente parado a ponto de ser pausado. Tambem serve de sonda honesta:
// diz se o banco respondeu e qual versao esta no ar, sem inventar causa.
async function healthResponse(): Promise<Response> {
  const corpo: { ok: boolean; versao: string; codigo: string; banco: string } = {
    ok: false,
    versao: BUILD.versao,
    codigo: BUILD.modificadoEm,
    banco: "nao_verificado",
  };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_config").select("installation_id").limit(1);
    if (error) throw new Error(error.message);
    corpo.ok = true;
    corpo.banco = "respondeu";
  } catch (erro) {
    corpo.banco = erro instanceof Error ? erro.message : String(erro);
    console.error("[meu-ponto] batimento do banco falhou:", corpo.banco);
  }
  return new Response(JSON.stringify(corpo), {
    status: corpo.ok ? 200 : 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return healthResponse();
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
