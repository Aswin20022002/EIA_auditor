/**
 * Single low-level entry point for every feature that needs a structured
 * JSON response from an LLM. Model choice, provider selection, error
 * handling, and defensive JSON parsing all live here so the rest of the
 * app (lib/eia-analysis.ts, lib/tor.ts) never touches a provider SDK or
 * API shape directly.
 *
 * Why Gemini as the default: Gemini's free tier gives a ~1M token context
 * window, which is what actually lets this app send full, generous
 * excerpts per chapter instead of the ~8k-token/minute ceiling the
 * previous Groq free-tier model imposed. That headroom is what fixed the
 * "only 2 of 18 ToR clauses addressed" false-negative problem: most of
 * those were the model genuinely not being shown enough text, not the
 * model being wrong.
 *
 * Why Groq stays supported: Google has tightened Gemini's free daily
 * request quota more than once. If GROQ_API_KEY is also set, a rate
 * limit or server error on Gemini automatically retries on Groq for that
 * one call, so a demo doesn't die mid-session because of a quota reset
 * neither of us controls. Set LLM_PROVIDER=groq to prefer Groq instead.
 *
 * Gemini 3.x note: the Gemini 3 model family (which gemini-3.6-flash
 * belongs to) replaced the old thinkingBudget field with thinkingLevel,
 * and Flash-tier Gemini 3 models cannot fully disable thinking the way
 * gemini-2.5-flash could with thinkingBudget: 0 — "low" is the minimum.
 * temperature/top_p/top_k are also deprecated across the whole Gemini 3.x
 * line (currently silently ignored, but Google has said a future version
 * may reject them outright), so they're left out entirely rather than
 * carried over from the 2.5-era request shape.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

type Provider = "gemini" | "groq";

class LlmError extends Error {
  provider: Provider;
  status?: number;
  constructor(provider: Provider, status: number | undefined, message: string) {
    super(message);
    this.name = "LlmError";
    this.provider = provider;
    this.status = status;
  }
}

/** Strips markdown code fences and any stray text around the JSON object,
 * in case the model doesn't respect responseMimeType/response_format
 * exactly (rare, but cheap to guard against). */
function extractJson(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
}

async function callGemini(system: string, user: string, maxTokens: number): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LlmError("gemini", undefined, "GEMINI_API_KEY is not set.");

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
        // "low" is the minimum thinking level Gemini 3 Flash models
        // support — they can't fully disable thinking the way
        // gemini-2.5-flash could with thinkingBudget: 0. Thinking tokens
        // still draw from maxOutputTokens, so if a long analysis starts
        // returning empty responses with finishReason MAX_TOKENS, raise
        // maxTokens to leave headroom for the unavoidable thinking cost.
        thinkingConfig: { thinkingLevel: "low" },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new LlmError("gemini", res.status, `Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const content: string = (candidate?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");

  if (!content.trim()) {
    if (finishReason === "MAX_TOKENS") {
      throw new Error(
        "Gemini's response was cut off before it finished (hit the output token limit). Try again; if this keeps happening on the same file, the report may need a smaller excerpt budget."
      );
    }
    if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
      throw new Error("Gemini declined to analyze this excerpt (safety filter). Try a different file.");
    }
    throw new LlmError("gemini", res.status, `Gemini returned an empty response (finishReason: ${finishReason ?? "unknown"}).`);
  }

  try {
    return JSON.parse(extractJson(content));
  } catch {
    throw new Error("Gemini returned a response that could not be parsed as JSON. Try again.");
  }
}

async function callGroq(system: string, user: string, maxTokens: number): Promise<any> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new LlmError("groq", undefined, "GROQ_API_KEY is not set.");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new LlmError("groq", res.status, `Groq API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";

  try {
    return JSON.parse(extractJson(content));
  } catch {
    throw new Error(
      "Groq returned a response that could not be parsed as JSON. Try again. This is occasionally caused by the model truncating a long list."
    );
  }
}

/** True for errors worth retrying on the other provider: rate limits and
 * transient server errors. A missing key, a bad prompt, or malformed JSON
 * will fail the same way everywhere, so those are surfaced immediately
 * instead of masked by a pointless second attempt. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof LlmError)) return false;
  return err.status === 429 || (err.status !== undefined && err.status >= 500);
}

export async function callLlmJson(system: string, user: string, maxTokens: number): Promise<any> {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasGroq = !!process.env.GROQ_API_KEY;

  if (!hasGemini && !hasGroq) {
    throw new Error(
      "No LLM API key is configured. Set GEMINI_API_KEY (free at aistudio.google.com/apikey) or GROQ_API_KEY (free at console.groq.com/keys) as an environment variable."
    );
  }

  const preferred = (process.env.LLM_PROVIDER || "").toLowerCase();
  const primary: Provider = preferred === "groq" ? "groq" : preferred === "gemini" ? "gemini" : hasGemini ? "gemini" : "groq";
  const secondary: Provider = primary === "gemini" ? "groq" : "gemini";

  const order = [primary, secondary].filter((p) => (p === "gemini" ? hasGemini : hasGroq));

  let lastErr: unknown;
  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    try {
      return provider === "gemini" ? await callGemini(system, user, maxTokens) : await callGroq(system, user, maxTokens);
    } catch (err) {
      lastErr = err;
      const hasNext = i < order.length - 1;
      if (!hasNext || !isRetryable(err)) throw err;
      // else: fall through and try the next configured provider
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("LLM request failed.");
}
