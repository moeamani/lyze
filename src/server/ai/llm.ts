import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AI_PROVIDERS, type AiProviderId } from "@/lib/ai-providers";

/**
 * The one thing every provider has to do for Lyze: answer a prompt as JSON matching a schema, or
 * as free text (Markdown). Each implementation hides its own API's details.
 */
export interface Llm {
  readonly provider: AiProviderId;
  json<T extends z.ZodType>(schema: T, system: string, prompt: string, effort?: "low" | "medium"): Promise<z.infer<T>>;
  write(system: string, prompt: string, pdf?: { data: Uint8Array; name: string } | null): Promise<string>;
}

export type LlmConfig = { provider: AiProviderId; apiKey: string; model: string; baseUrl?: string | null };

const TIMEOUT = 180_000;

export function createLlm(cfg: LlmConfig): Llm {
  const info = AI_PROVIDERS[cfg.provider];
  if (info.protocol === "anthropic") return anthropicLlm(cfg);
  if (info.protocol === "gemini") return geminiLlm(cfg);
  return openAiLlm({ ...cfg, baseUrl: cfg.baseUrl || info.baseUrl || "" });
}

// ── Anthropic ───────────────────────────────────────────────────────────────

function anthropicLlm(cfg: LlmConfig): Llm {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  return {
    provider: "anthropic",
    async json(schema, system, prompt, effort = "medium") {
      const response = await client.beta.messages.parse({
        model: cfg.model,
        max_tokens: 16000,
        system,
        // If a request is declined by a safety classifier, let the API retry it on a fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort, format: betaZodOutputFormat(schema) },
        messages: [{ role: "user", content: prompt }],
      });
      if (response.stop_reason === "refusal") throw new Error("The assistant declined this request.");
      if (!response.parsed_output) throw new Error("The assistant returned an unexpected answer.");
      return response.parsed_output as z.infer<typeof schema>;
    },
    async write(system, prompt, pdf) {
      const content: Anthropic.ContentBlockParam[] = [];
      if (pdf?.data.length) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf.data).toString("base64") }, title: pdf.name });
      content.push({ type: "text", text: prompt });
      const message = await client.messages.stream({ model: cfg.model, max_tokens: 16000, system, thinking: { type: "adaptive" }, messages: [{ role: "user", content }] }).finalMessage();
      if (message.stop_reason === "refusal") throw new Error("The assistant declined this request.");
      return message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    },
  };
}

// ── JSON from providers without schema-constrained output ───────────────────

/** Pull a JSON value out of a model's reply (tolerates code fences and stray prose around it). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1]! : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.search(/[[{]/);
    const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error("The assistant did not return JSON.");
  }
}

const jsonInstruction = (schema: z.ZodType) =>
  `\n\nRespond with a single JSON object and nothing else. It must match this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`;

/** Ask, validate against the schema, and on a malformed answer ask once more with the error. */
async function jsonWithRetry<T extends z.ZodType>(schema: T, ask: (extra: string) => Promise<string>): Promise<z.infer<T>> {
  let reply = await ask("");
  for (let attempt = 0; ; attempt++) {
    try {
      return schema.parse(extractJson(reply)) as z.infer<T>;
    } catch (error) {
      if (attempt >= 1) throw new Error("The assistant's answer didn't have the expected shape.");
      reply = await ask(`\n\nYour previous answer was not valid (${error instanceof Error ? error.message.slice(0, 300) : "invalid"}). Return only the corrected JSON.`);
    }
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT) });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`AI provider error ${res.status}: ${text.slice(0, 300)}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

// ── Google Gemini ───────────────────────────────────────────────────────────

function geminiLlm(cfg: LlmConfig): Llm {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
  const call = async (system: string, parts: unknown[], asJson: boolean) => {
    const data = await postJson(url, { "x-goog-api-key": cfg.apiKey }, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: 16000, ...(asJson ? { responseMimeType: "application/json" } : {}) },
    });
    const candidates = data.candidates as { content?: { parts?: { text?: string }[] }; finishReason?: string }[] | undefined;
    const first = candidates?.[0];
    if (!first?.content?.parts) throw new Error(first?.finishReason === "SAFETY" ? "The assistant declined this request." : "The assistant returned an empty answer.");
    return first.content.parts.map((p) => p.text ?? "").join("");
  };
  return {
    provider: "gemini",
    json: (schema, system, prompt) => jsonWithRetry(schema, (extra) => call(system, [{ text: prompt + jsonInstruction(schema) + extra }], true)),
    async write(system, prompt, pdf) {
      const parts: unknown[] = [];
      if (pdf?.data.length) parts.push({ inlineData: { mimeType: "application/pdf", data: Buffer.from(pdf.data).toString("base64") } });
      parts.push({ text: prompt });
      return (await call(system, parts, false)).trim();
    },
  };
}

// ── OpenAI-compatible (OpenAI, Groq, OpenRouter, Mistral, Ollama, others) ─────

function openAiLlm(cfg: LlmConfig & { baseUrl: string }): Llm {
  if (!cfg.baseUrl) throw new Error("This AI provider needs a base URL.");
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
  if (cfg.provider === "openrouter") Object.assign(headers, { "x-title": "Lyze" });
  const call = async (system: string, prompt: string, asJson: boolean) => {
    const data = await postJson(url, headers, {
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      ...(asJson ? { response_format: { type: "json_object" } } : {}),
      max_tokens: 8000,
      temperature: asJson ? 0.2 : 0.5,
    });
    const choice = (data.choices as { message?: { content?: string | null }; finish_reason?: string }[] | undefined)?.[0];
    const text = choice?.message?.content;
    if (!text) throw new Error(choice?.finish_reason === "content_filter" ? "The assistant declined this request." : "The assistant returned an empty answer.");
    return text;
  };
  return {
    provider: cfg.provider,
    json: (schema, system, prompt) => jsonWithRetry(schema, (extra) => call(system, prompt + jsonInstruction(schema) + extra, true)),
    // PDFs are not sent: these providers get the proposal's extracted text instead.
    write: async (system, prompt) => (await call(system, prompt, false)).trim(),
  };
}

/** Check a key and endpoint without spending tokens: list the provider's models. */
export async function pingLlm(cfg: LlmConfig): Promise<"ok" | "rejected" | "unreachable"> {
  const info = AI_PROVIDERS[cfg.provider];
  try {
    if (info.protocol === "anthropic") {
      await new Anthropic({ apiKey: cfg.apiKey }).models.list({ limit: 1 });
      return "ok";
    }
    const url = info.protocol === "gemini" ? "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1" : `${(cfg.baseUrl || info.baseUrl || "").replace(/\/+$/, "")}/models`;
    const headers: Record<string, string> = info.protocol === "gemini" ? { "x-goog-api-key": cfg.apiKey } : cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (res.ok) return "ok";
    return res.status === 401 || res.status === 403 ? "rejected" : "unreachable";
  } catch (e) {
    const status = (e as { status?: number }).status;
    return status === 401 || status === 403 ? "rejected" : "unreachable";
  }
}
