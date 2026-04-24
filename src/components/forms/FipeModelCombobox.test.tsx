import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

import { toast } from "sonner";
import { FipeModelCombobox } from "./FipeModelCombobox";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Wrapper, qc };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("FipeModelCombobox", () => {
  it("trigger is disabled when brand is empty", () => {
    const { Wrapper } = makeWrapper();
    render(<FipeModelCombobox brand="" value="" onChange={() => {}} />, { wrapper: Wrapper });
    const trigger = screen.getByRole("combobox") as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    expect(trigger).toHaveTextContent("Selecione a marca primeiro");
  });

  it("fetches /api/fipe?type=models&brand=X on brand change", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ models: [{ codigo: "1", nome: "Civic" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = makeWrapper();
    render(<FipeModelCombobox brand="Honda" value="" onChange={() => {}} />, {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/fipe?type=models&brand=Honda"),
        expect.any(Object),
      );
    });
  });

  it("falls back to free-text Input on 500 (D-05) with toast.info", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "oops" }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = makeWrapper();
    render(<FipeModelCombobox brand="Honda" value="" onChange={() => {}} />, {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith("FIPE indisponível — digite manualmente");
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Digite o modelo")).toBeInTheDocument();
    });
  });

  it("falls back to free-text Input on network error (rejected fetch)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = makeWrapper();
    render(<FipeModelCombobox brand="Honda" value="" onChange={() => {}} />, {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Digite o modelo")).toBeInTheDocument();
    });
  });
});
