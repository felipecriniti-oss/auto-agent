import type { Listing } from "@/lib/schemas/listing";
import { beforeEach, describe, expect, it } from "vitest";
import { renderMessageContent, useNegotiationStore } from "./negotiation";

const validListing: Listing = {
  marca: "Volkswagen",
  modelo: "Gol 1.6",
  ano: 2020,
  km: 45000,
  precoPedido: 52000,
  cidade: "São Paulo",
  diasOnline: 30,
  reducoes: 2,
};

function resetStore() {
  localStorage.clear();
  useNegotiationStore.setState({ currentSession: null, history: [] });
}

beforeEach(() => {
  resetStore();
});

describe("useNegotiationStore — initial state", () => {
  it("starts with null currentSession and empty history", () => {
    const s = useNegotiationStore.getState();
    expect(s.currentSession).toBeNull();
    expect(s.history).toEqual([]);
  });
});

describe("useNegotiationStore — derived prices", () => {
  it("computes targetPrice = Math.round(fipe * 0.75) (D-10)", () => {
    useNegotiationStore.getState().initSession(validListing, 52000);
    expect(useNegotiationStore.getState().currentSession?.targetPrice).toBe(39000);
  });

  it("computes walkAwayPrice = Math.round(fipe * 0.90) (D-09)", () => {
    useNegotiationStore.getState().initSession(validListing, 52000);
    expect(useNegotiationStore.getState().currentSession?.walkAwayPrice).toBe(46800);
  });

  it("rounds derived prices for non-clean fipe values", () => {
    useNegotiationStore.getState().initSession(validListing, 52345);
    const s = useNegotiationStore.getState().currentSession;
    expect(s?.targetPrice).toBe(Math.round(52345 * 0.75));
    expect(s?.walkAwayPrice).toBe(Math.round(52345 * 0.9));
  });
});

describe("useNegotiationStore — initSession", () => {
  it("initializes a complete Session with status=idle, round=0", () => {
    useNegotiationStore.getState().initSession(validListing, 52000);
    const s = useNegotiationStore.getState().currentSession;
    expect(s?.listing).toEqual(validListing);
    expect(s?.fipe).toBe(52000);
    expect(s?.maxRounds).toBe(6);
    expect(s?.round).toBe(0);
    expect(s?.messages).toEqual([]);
    expect(s?.status).toBe("idle");
    expect(s?.startedAt).toBeNull();
    expect(s?.endedAt).toBeNull();
    expect(s?.endReason).toBeNull();
    expect(s?.id).toBeTruthy();
  });
});

describe("useNegotiationStore — manual fipe (FIPE-02)", () => {
  it("setFipe replaces fipe and re-derives target/walkAway prices", () => {
    const { initSession, setFipe } = useNegotiationStore.getState();
    initSession(validListing, 52000);
    setFipe(60000);
    const s = useNegotiationStore.getState().currentSession;
    expect(s?.fipe).toBe(60000);
    expect(s?.targetPrice).toBe(45000);
    expect(s?.walkAwayPrice).toBe(54000);
  });

  it("setFipe is a no-op when currentSession is null", () => {
    useNegotiationStore.getState().setFipe(60000);
    expect(useNegotiationStore.getState().currentSession).toBeNull();
  });
});

describe("useNegotiationStore — startNegotiating", () => {
  it("transitions idle → negotiating and sets startedAt", () => {
    const { initSession, startNegotiating } = useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    const s = useNegotiationStore.getState().currentSession;
    expect(s?.status).toBe("negotiating");
    expect(s?.startedAt).toBeTruthy();
    expect(() => new Date(s?.startedAt ?? "").toISOString()).not.toThrow();
  });
});

describe("useNegotiationStore — appendAgentChunk & round increments", () => {
  it("round increments on first chunk of a new agent turn (D-08)", () => {
    const { initSession, startNegotiating, appendAgentChunk } = useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    appendAgentChunk("Olá, ");
    expect(useNegotiationStore.getState().currentSession?.round).toBe(1);
  });

  it("successive chunks do not increment round; they extend the streaming bubble", () => {
    const { initSession, startNegotiating, appendAgentChunk } = useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    appendAgentChunk("Olá, ");
    appendAgentChunk("tudo bem?");
    const s = useNegotiationStore.getState().currentSession;
    expect(s?.round).toBe(1);
    expect(s?.messages).toHaveLength(1);
    expect(s?.messages[0].content).toBe("Olá, tudo bem?");
    expect(s?.messages[0].isStreaming).toBe(true);
  });
});

describe("useNegotiationStore — finalizeAgentMessage", () => {
  it("sets isStreaming=false on the last agent message", () => {
    const { initSession, startNegotiating, appendAgentChunk, finalizeAgentMessage } =
      useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    appendAgentChunk("Mensagem do agente.");
    finalizeAgentMessage();
    const s = useNegotiationStore.getState().currentSession;
    expect(s?.messages[0].isStreaming).toBe(false);
  });

  it("auto-triggers ended with endReason=max_rounds when round reaches maxRounds (D-12)", () => {
    const {
      initSession,
      startNegotiating,
      appendAgentChunk,
      finalizeAgentMessage,
      addSellerMessage,
    } = useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    for (let i = 0; i < 6; i++) {
      appendAgentChunk(`Rodada ${i + 1}.`);
      finalizeAgentMessage();
      if (i < 5) addSellerMessage("ok");
    }
    const s = useNegotiationStore.getState().currentSession;
    expect(s?.round).toBe(6);
    expect(s?.status).toBe("ended");
    expect(s?.endReason).toBe("max_rounds");
    expect(s?.endedAt).toBeTruthy();
  });

  it("is a no-op if last message is not streaming", () => {
    const { initSession, startNegotiating, appendAgentChunk, finalizeAgentMessage } =
      useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    appendAgentChunk("msg");
    finalizeAgentMessage();
    const before = useNegotiationStore.getState().currentSession?.messages[0];
    finalizeAgentMessage();
    const after = useNegotiationStore.getState().currentSession?.messages[0];
    expect(after).toEqual(before);
  });
});

describe("useNegotiationStore — addSellerMessage", () => {
  it("appends a seller message with role=seller and current round", () => {
    const {
      initSession,
      startNegotiating,
      appendAgentChunk,
      finalizeAgentMessage,
      addSellerMessage,
    } = useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    appendAgentChunk("opener");
    finalizeAgentMessage();
    addSellerMessage("R$ 50k é o mínimo");
    const s = useNegotiationStore.getState().currentSession;
    expect(s?.messages).toHaveLength(2);
    expect(s?.messages[1].role).toBe("seller");
    expect(s?.messages[1].content).toBe("R$ 50k é o mínimo");
    expect(s?.messages[1].round).toBe(1);
  });
});

describe("useNegotiationStore — endSession (D-11)", () => {
  it("drops the in-progress streaming bubble and transitions to ended", () => {
    const { initSession, startNegotiating, appendAgentChunk, endSession } =
      useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    appendAgentChunk("partial mid-stream...");
    endSession("user_stopped");
    const s = useNegotiationStore.getState().currentSession;
    expect(s?.messages).toHaveLength(0);
    expect(s?.status).toBe("ended");
    expect(s?.endReason).toBe("user_stopped");
    expect(s?.endedAt).toBeTruthy();
  });
});

describe("useNegotiationStore — newNegotiation", () => {
  it("archives ended currentSession into history and resets currentSession", () => {
    const { initSession, startNegotiating, endSession, newNegotiation } =
      useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    endSession("user_stopped");
    newNegotiation();
    const st = useNegotiationStore.getState();
    expect(st.currentSession).toBeNull();
    expect(st.history).toHaveLength(1);
  });

  it("does NOT archive if session is still negotiating", () => {
    const { initSession, startNegotiating, newNegotiation } = useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    newNegotiation();
    const st = useNegotiationStore.getState();
    expect(st.currentSession).toBeNull();
    expect(st.history).toEqual([]);
  });
});

describe("useNegotiationStore — getArgumentsUsed (NEG-05)", () => {
  it("extracts <arg>...</arg> matches from agent messages", () => {
    const {
      initSession,
      startNegotiating,
      appendAgentChunk,
      finalizeAgentMessage,
      getArgumentsUsed,
    } = useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    appendAgentChunk("Oferta <arg>à vista em 48h</arg>.");
    finalizeAgentMessage();
    expect(getArgumentsUsed()).toEqual(["à vista em 48h"]);
  });

  it("handles multiple args in one message", () => {
    const {
      initSession,
      startNegotiating,
      appendAgentChunk,
      finalizeAgentMessage,
      getArgumentsUsed,
    } = useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    appendAgentChunk("<arg>A</arg> e também <arg>B</arg>.");
    finalizeAgentMessage();
    expect(getArgumentsUsed()).toEqual(["A", "B"]);
  });

  it("deduplicates repeated args across messages", () => {
    const {
      initSession,
      startNegotiating,
      appendAgentChunk,
      finalizeAgentMessage,
      addSellerMessage,
      getArgumentsUsed,
    } = useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    appendAgentChunk("<arg>à vista</arg>");
    finalizeAgentMessage();
    addSellerMessage("ok");
    appendAgentChunk("<arg>à vista</arg> repetido");
    finalizeAgentMessage();
    expect(getArgumentsUsed()).toEqual(["à vista"]);
  });

  it("ignores <arg> tags in seller messages", () => {
    const { initSession, startNegotiating, addSellerMessage, getArgumentsUsed } =
      useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();
    addSellerMessage("<arg>seller-injected</arg>");
    expect(getArgumentsUsed()).toEqual([]);
  });

  it("returns [] when currentSession is null", () => {
    expect(useNegotiationStore.getState().getArgumentsUsed()).toEqual([]);
  });
});

describe("renderMessageContent (D-14)", () => {
  it("strips <arg> and </arg> tags", () => {
    expect(renderMessageContent("Oferta <arg>à vista</arg> em 48h")).toBe("Oferta à vista em 48h");
  });

  it("handles multiple tags", () => {
    expect(renderMessageContent("<arg>A</arg> e <arg>B</arg>")).toBe("A e B");
  });

  it("is a no-op on content without tags", () => {
    expect(renderMessageContent("texto normal")).toBe("texto normal");
  });
});

describe("useNegotiationStore — persist roundtrip (STATE-02)", () => {
  it("persists currentSession to localStorage and rehydrates on new store instance", () => {
    const { initSession, startNegotiating } = useNegotiationStore.getState();
    initSession(validListing, 52000);
    startNegotiating();

    useNegotiationStore.persist.rehydrate();

    const raw = localStorage.getItem("autoagent-playground-v1");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.version).toBe(1);
    expect(parsed.state.currentSession.listing.marca).toBe("Volkswagen");
    expect(parsed.state.currentSession.status).toBe("negotiating");
  });

  it("partialize only emits currentSession and history (not actions)", () => {
    useNegotiationStore.getState().initSession(validListing, 52000);
    useNegotiationStore.persist.rehydrate();
    const raw = JSON.parse(localStorage.getItem("autoagent-playground-v1") ?? "{}");
    const keys = Object.keys(raw.state).sort();
    expect(keys).toEqual(["currentSession", "history"]);
  });
});
