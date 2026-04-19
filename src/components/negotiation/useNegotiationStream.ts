/**
 * Client-side SSE consumer for POST /api/negotiate/stream.
 *
 * Uses fetch+ReadableStream (NOT EventSource — EventSource is GET-only per
 * RESEARCH Pitfall #1).
 *
 * Buffers partial frames because SSE chunks can split mid-frame per Pitfall #2.
 */

import type { NegotiateRequest } from "@/lib/schemas/negotiate";

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (code: "rate_limited" | "disabled" | "upstream_failed" | string) => void;
}

export async function startNegotiation(
  body: NegotiateRequest,
  cb: StreamCallbacks,
  signal: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/negotiate/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    cb.onError("network_failed");
    return;
  }

  if (!response.ok) {
    if (response.status === 429) cb.onError("rate_limited");
    else if (response.status === 503) cb.onError("disabled");
    else cb.onError(`http_${response.status}`);
    return;
  }

  if (!response.body) {
    cb.onError("no_body");
    return;
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        if (!frame.startsWith("data: ")) continue;
        const json = frame.slice(6);
        let msg: { type: string; text?: string; message?: string };
        try {
          msg = JSON.parse(json);
        } catch {
          console.warn("Malformed SSE frame:", json);
          continue;
        }
        if (msg.type === "chunk" && typeof msg.text === "string") cb.onChunk(msg.text);
        else if (msg.type === "done") cb.onDone();
        else if (msg.type === "error") cb.onError(msg.message ?? "upstream_failed");
      }
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    cb.onError("stream_read_failed");
  } finally {
    reader.releaseLock();
  }
}
