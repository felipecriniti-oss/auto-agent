import type { Message } from "@/lib/types/message";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "./MessageBubble";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "1",
    role: "agent",
    round: 1,
    content: "conteúdo",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("MessageBubble", () => {
  it("strips <arg> and </arg> tags from displayed content (D-14, NEG-04)", () => {
    render(
      <MessageBubble
        message={makeMessage({ content: "Oferta <arg>à vista em 48h</arg> clean." })}
      />,
    );
    const bubble = screen.getByTestId("message-bubble");
    expect(bubble.textContent).toContain("Oferta à vista em 48h clean.");
    expect(bubble.textContent).not.toContain("<arg>");
    expect(bubble.textContent).not.toContain("</arg>");
  });

  it("applies agent styling for role='agent' (D-02)", () => {
    render(<MessageBubble message={makeMessage({ role: "agent" })} />);
    const bubble = screen.getByTestId("message-bubble");
    expect(bubble.dataset.role).toBe("agent");
    expect(bubble.className).toContain("bg-slate-100");
  });

  it("applies seller styling for role='seller' (D-02)", () => {
    render(<MessageBubble message={makeMessage({ role: "seller" })} />);
    const bubble = screen.getByTestId("message-bubble");
    expect(bubble.dataset.role).toBe("seller");
    expect(bubble.className).toContain("bg-emerald-500");
  });

  it("renders ▌ cursor while streaming (D-05 phase b)", () => {
    render(<MessageBubble message={makeMessage({ isStreaming: true })} />);
    const bubble = screen.getByTestId("message-bubble");
    expect(bubble.textContent).toContain("▌");
  });

  it("does NOT render ▌ cursor once streaming is finished (D-05 phase c)", () => {
    render(<MessageBubble message={makeMessage({ isStreaming: false })} />);
    const bubble = screen.getByTestId("message-bubble");
    expect(bubble.textContent).not.toContain("▌");
  });

  it("renders error state when message.error is true", () => {
    render(<MessageBubble message={makeMessage({ error: true })} />);
    expect(screen.getByText(/Falha ao completar resposta/)).toBeInTheDocument();
  });
});
