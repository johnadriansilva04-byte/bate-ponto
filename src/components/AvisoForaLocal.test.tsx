import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvisoForaLocal } from "./AvisoForaLocal";
import type { GeoFix } from "@/lib/geo";

const fix: GeoFix = { latitude: -27.6058, longitude: -48.5436, status: "ok", accuracy: 12 };
const previsto = {
  endereco: "AV MAURO RAMOS 765, CENTRO, FLORIANÓPOLIS - SC",
  latitude: -27.5958794,
  longitude: -48.543594,
  raioMetros: 300,
};

afterEach(() => vi.unstubAllGlobals());

describe("AvisoForaLocal", () => {
  it("shows the expected place and the place actually recorded", async () => {
    // Sem rede: o aviso usa as coordenadas e nao pode ficar em branco.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(
      <AvisoForaLocal
        fix={fix}
        previsto={previsto}
        distancia={1100}
        toque="entrada"
        onFechar={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/fora do local previsto/i)).toBeInTheDocument();
    expect(screen.getByText(/AV MAURO RAMOS 765/)).toBeInTheDocument();
    expect(screen.getByText(/1,1 km/)).toBeInTheDocument();
    expect(screen.getByText(/a entrada/)).toBeInTheDocument();
    // A coordenada do toque aparece como nome do lugar quando nao ha internet.
    await waitFor(() => expect(screen.getByText(/-27\.60580, -48\.54360/)).toBeInTheDocument());
  });

  it("replaces the coordinates with the place name when the service answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ display_name: "Rua XV de Novembro, 100 - Centro, Florianópolis" }),
      }),
    );

    render(
      <AvisoForaLocal
        fix={fix}
        previsto={previsto}
        distancia={4200}
        toque="saida"
        onFechar={() => {}}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Rua XV de Novembro, 100 - Centro, Florianópolis/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/4,2 km/)).toBeInTheDocument();
    expect(screen.getByText(/a saída/)).toBeInTheDocument();
  });
});
