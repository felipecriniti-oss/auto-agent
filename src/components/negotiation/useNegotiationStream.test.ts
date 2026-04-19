import type { NegotiateRequest } from "@/lib/schemas/negotiate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startNegotiation } from "./useNegotiationStream";

const validBody: NegotiateRequest = {
  listing: {
    marca: "VW",
    modelo: "Gol 1.6",
    ano: 2020,
    km: 45000,
    precoPedido: 52000,
    cidade: "SP",
    diasOnline: 30,
    reducoes: 2,
  },
  fipe: 52000,
  targetPrice: 39000,
  walkAwayPrice: 46800,
  maxRounds: 6,
  messages: [{ role: "user", content: "Oi" }],
};

function sseResponse(text: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("startNegotiation — SSE parsing", () => {
  it("accumulates chunks in order", async () => {
    const frames =
      'data: {"type":"chunk","text":"Olá, "}\n\n' +
      'data: {"type":"chunk","text":"tudo "}\n\n' +
      'data: {"type":"chunk","text":"bem?"}\n\n' +
      'data: {"type":"done"}\n\n';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

    const chunks: string[] = [];
    let done = false;
    await startNegotiation(
      validBody,
      {
        onChunk: (t) => chunks.push(t),
        onDone: () => {
          done = true;
        },
        onError: () => {},
      },
      new AbortController().signal,
    );
    expect(chunks).toEqual(["Olá, ", "tudo ", "bem?"]);
    expect(done).toBe(true);
  });

  it("handles split mid-frame via buffer (Pitfall #2)", async () => {
    const half1 = 'data: {"type":"chunk","text":"hel';
    const half2 = 'lo"}\n\ndata: {"type":"done"}\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(half1));
        controller.enqueue(new TextEncoder().encode(half2));
        controller.close();
      },
    });
    const response = new Response(stream, { status: 200 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const chunks: string[] = [];
    await startNegotiation(
      validBody,
      { onChunk: (t) => chunks.push(t), onDone: () => {}, onError: () => {} },
      new AbortController().signal,
    );
    expect(chunks).toEqual(["hello"]);
  });

  it("routes 429 to onError('rate_limited')", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    let code: string | null = null;
    await startNegotiation(
      validBody,
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (c) => {
          code = c;
        },
      },
      new AbortController().signal,
    );
    expect(code).toBe("rate_limited");
  });

  it("routes 503 to onError('disabled')", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    let code: string | null = null;
    await startNegotiation(
      validBody,
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (c) => {
          code = c;
        },
      },
      new AbortController().signal,
    );
    expect(code).toBe("disabled");
  });

  it("routes error frame to onError('upstream_failed')", async () => {
    const frames = 'data: {"type":"error","message":"upstream_failed"}\n\n';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));
    let code: string | null = null;
    await startNegotiation(
      validBody,
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (c) => {
          code = c;
        },
      },
      new AbortController().signal,
    );
    expect(code).toBe("upstream_failed");
  });

  it("silently skips malformed JSON frame", async () => {
    const frames =
      "data: {broken\n\n" + 'data: {"type":"chunk","text":"ok"}\n\n' + 'data: {"type":"done"}\n\n';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));
    const chunks: string[] = [];
    let done = false;
    await startNegotiation(
      validBody,
      {
        onChunk: (t) => chunks.push(t),
        onDone: () => {
          done = true;
        },
        onError: () => {},
      },
      new AbortController().signal,
    );
    expect(chunks).toEqual(["ok"]);
    expect(done).toBe(true);
  });

  it("respects AbortSignal (fetch throws AbortError → no onError call)", async () => {
    const ctl = new AbortController();
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr));

    let errorCalled = false;
    await startNegotiation(
      validBody,
      {
        onChunk: () => {},
        onDone: () => {},
        onError: () => {
          errorCalled = true;
        },
      },
      ctl.signal,
    );
    expect(errorCalled).toBe(false);
  });
});
