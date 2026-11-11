import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceGate } from "./DeviceGate";

// A tela de abertura nao pode culpar a internet de quem usa quando o problema
// e do servidor. Este teste garante o comportamento observado em producao: o
// celular tinha internet e o app dizia "Sem internet".

vi.mock("@/lib/sessions-api", () => ({
  fetchDeviceState: vi.fn(),
  authorizeThisDevice: vi.fn(),
}));

import { fetchDeviceState } from "@/lib/sessions-api";

const mockState = fetchDeviceState as unknown as ReturnType<typeof vi.fn>;

describe("DeviceGate", () => {
  beforeEach(() => {
    localStorage.clear();
    mockState.mockReset();
    // jsdom: o aparelho esta conectado (tem internet).
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("com internet, um servidor fora do ar nao vira 'Sem internet'", async () => {
    mockState.mockRejectedValue(new Error("TypeError: fetch failed"));

    render(
      <DeviceGate>
        <p>conteudo do app</p>
      </DeviceGate>,
    );

    await waitFor(() => expect(screen.getByText(/servidor não respondeu/i)).toBeInTheDocument());
    expect(screen.queryByText("Sem internet")).not.toBeInTheDocument();
    expect(screen.getByText(/celular está com internet/i)).toBeInTheDocument();
    expect(screen.queryByText("conteudo do app")).not.toBeInTheDocument();
  });

  it("sem rede, a mensagem fala da internet do aparelho", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    mockState.mockRejectedValue(new Error("offline"));

    render(
      <DeviceGate>
        <p>conteudo do app</p>
      </DeviceGate>,
    );

    await waitFor(() => expect(screen.getByText("Sem internet")).toBeInTheDocument());
    expect(screen.getByText(/Ligue a internet/i)).toBeInTheDocument();
  });

  it("aparelho ja liberado entra direto mesmo com o servidor fora do ar", async () => {
    // Simula o titular que ja usou este aparelho antes: o mesmo codigo gravado
    // nas duas marcas (aparelho + liberado).
    const id = "ap-0123456789abcdef0123456789abcdef";
    localStorage.setItem("meuponto.aparelho.v1", id);
    localStorage.setItem("meuponto.liberado.v1", id);
    mockState.mockRejectedValue(new Error("TypeError: fetch failed"));

    render(
      <DeviceGate>
        <p>conteudo do app</p>
      </DeviceGate>,
    );

    await waitFor(() => expect(screen.getByText("conteudo do app")).toBeInTheDocument());
    expect(screen.queryByText(/servidor não respondeu/i)).not.toBeInTheDocument();
  });
});
