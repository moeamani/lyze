/**
 * AI providers a workspace can connect. Anthropic and Gemini have their own APIs; the rest speak
 * the OpenAI chat-completions protocol, so one client covers them (and any compatible server).
 * Model names change often, so the model field is free text with these as suggestions.
 */
export const AI_PROVIDER_IDS = ["anthropic", "gemini", "groq", "openrouter", "mistral", "openai", "ollama", "custom"] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export type AiProviderInfo = {
  label: string;
  /** Has a free tier or free models (rate-limited). */
  free: boolean;
  /** Needs an API key (Ollama on your own machine doesn't). */
  needsKey: boolean | "optional";
  protocol: "anthropic" | "gemini" | "openai";
  /** Default endpoint for OpenAI-compatible providers; editable for Ollama and custom. */
  baseUrl: string | null;
  editableUrl: boolean;
  models: string[];
  /** Where to get a key (or the software). */
  keyUrl: string | null;
  /** Can read PDFs directly (others get the extracted text). */
  readsPdf: boolean;
};

export const AI_PROVIDERS: Record<AiProviderId, AiProviderInfo> = {
  anthropic: { label: "Anthropic Claude", free: false, needsKey: true, protocol: "anthropic", baseUrl: null, editableUrl: false, models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5-20251001"], keyUrl: "https://console.anthropic.com/settings/keys", readsPdf: true },
  gemini: { label: "Google Gemini", free: true, needsKey: true, protocol: "gemini", baseUrl: null, editableUrl: false, models: ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"], keyUrl: "https://aistudio.google.com/apikey", readsPdf: true },
  groq: { label: "Groq", free: true, needsKey: true, protocol: "openai", baseUrl: "https://api.groq.com/openai/v1", editableUrl: false, models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b"], keyUrl: "https://console.groq.com/keys", readsPdf: false },
  openrouter: { label: "OpenRouter", free: true, needsKey: true, protocol: "openai", baseUrl: "https://openrouter.ai/api/v1", editableUrl: false, models: ["meta-llama/llama-3.3-70b-instruct:free", "deepseek/deepseek-chat-v3-0324:free", "google/gemma-3-27b-it:free"], keyUrl: "https://openrouter.ai/settings/keys", readsPdf: false },
  mistral: { label: "Mistral", free: true, needsKey: true, protocol: "openai", baseUrl: "https://api.mistral.ai/v1", editableUrl: false, models: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"], keyUrl: "https://console.mistral.ai/api-keys", readsPdf: false },
  openai: { label: "OpenAI", free: false, needsKey: true, protocol: "openai", baseUrl: "https://api.openai.com/v1", editableUrl: false, models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"], keyUrl: "https://platform.openai.com/api-keys", readsPdf: false },
  ollama: { label: "Ollama (runs on your computer)", free: true, needsKey: false, protocol: "openai", baseUrl: "http://localhost:11434/v1", editableUrl: true, models: ["llama3.1", "qwen2.5", "mistral"], keyUrl: "https://ollama.com/download", readsPdf: false },
  custom: { label: "Other (OpenAI-compatible)", free: false, needsKey: "optional", protocol: "openai", baseUrl: "", editableUrl: true, models: [], keyUrl: null, readsPdf: false },
};

export const isProviderId = (v: unknown): v is AiProviderId => typeof v === "string" && (AI_PROVIDER_IDS as readonly string[]).includes(v);

/** Display name for a stored provider id ("claude" is the id older drafts were saved with). */
export function providerLabel(id: string | null | undefined): string {
  if (!id || id === "builtin") return "Built-in";
  if (id === "claude") return "Claude";
  if (id === "lyze") return "Lyze AI";
  return isProviderId(id) ? AI_PROVIDERS[id].label.replace(/\s*\(.*\)$/, "") : id;
}
