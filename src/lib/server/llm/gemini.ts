import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import type { StreamOptions } from "./types";

// Free tier model; override with GEMINI_MODEL when needed.
const DEFAULT_MODEL = "gemini-2.5-flash";

// Negotiation talk (prices, pressure tactics, etc.) sometimes trips safety
// filters. This is a B2B playground — turn them all off so the agent can
// negotiate without synthetic refusals.
const PERMISSIVE_SAFETY = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

export async function streamGemini(opts: StreamOptions): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  if (opts.signal.aborted) throw new Error("aborted");

  // Map assistant → model; Gemini expects alternation starting with user.
  // The caller (streamLLM in ./index.ts) has already run normalizeMessages, so
  // opts.messages is guaranteed to start with a user turn.
  const mapped = opts.messages.map((msg) => ({
    role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: msg.content }],
  }));

  // sendMessageStream takes the final user turn; prior turns go as history.
  const last = mapped[mapped.length - 1];
  if (!last || last.role !== "user") {
    throw new Error("gemini requires the last message to be from the user");
  }
  const history = mapped.slice(0, -1);

  const genAI = new GoogleGenerativeAI(apiKey);
  const generativeModel = genAI.getGenerativeModel({
    model,
    systemInstruction: opts.systemPrompt,
    safetySettings: PERMISSIVE_SAFETY,
  });
  const chat = generativeModel.startChat({
    history,
    generationConfig: { maxOutputTokens: opts.maxTokens },
  });

  const result = await chat.sendMessageStream(last.parts[0].text);
  for await (const chunk of result.stream) {
    if (opts.signal.aborted) throw new Error("aborted");
    const text = chunk.text();
    if (text) opts.onText(text);
  }
}
