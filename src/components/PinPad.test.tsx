import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PinPad } from "./PinPad";
import type { PinResult } from "@/lib/pin";

const ok: PinResult = { ok: true, motivo: "ok", restantes: 5 };

describe("PinPad", () => {
  it("confere a senha digitada normalmente", async () => {
    const verify = vi.fn().mockResolvedValue(ok);
    const onOk = vi.fn();
    render(<PinPad open action="liberar" onCancel={() => {}} onOk={onOk} verify={verify} />);

    for (const d of "135790") fireEvent.click(screen.getByRole("button", { name: `Número ${d}` }));

    await waitFor(() => expect(verify).toHaveBeenCalledWith("135790"));
    expect(onOk).toHaveBeenCalled();
  });

  it("apaga o ultimo numero e continua a partir do que sobrou", async () => {
    // Este e o caso do dia a dia: errou um digito, apaga, digita de novo.
    const verify = vi.fn().mockResolvedValue(ok);
    render(<PinPad open action="liberar" onCancel={() => {}} onOk={() => {}} verify={verify} />);

    for (const d of "12345") fireEvent.click(screen.getByRole("button", { name: `Número ${d}` }));
    // Errou os dois ultimos: apaga os dois.
    fireEvent.click(screen.getByRole("button", { name: /apagar/i }));
    fireEvent.click(screen.getByRole("button", { name: /apagar/i }));
    for (const d of "456") fireEvent.click(screen.getByRole("button", { name: `Número ${d}` }));

    await waitFor(() => expect(verify).toHaveBeenCalled());
    // Sobrou "123" e digitou "456": a senha conferida tem que ser "123456".
    // Sem corrigir o ref ao apagar, sairia "123454" — o digito apagado voltava.
    expect(verify).toHaveBeenCalledWith("123456");
  });
});
