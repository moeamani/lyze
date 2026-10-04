import "server-only";
import type { GuideDoc } from "@/lib/interviews/guide";
import type { SegmentInput } from "@/lib/interviews/transcript";
import { mockProvider } from "./mock";
import { openAiProvider } from "./openai";
import { geminiProvider } from "./gemini";
import { LYZE_DEFAULT_MODEL, LYZE_FALLBACK_MODEL, lyzeCredentials } from "@/server/services/ai-settings";

export type TranscriptionInput = {
  media: Uint8Array;
  mime: string;
  filename: string;
  durationMs: number | null;
  language?: string | null;
  /** Hints for providers that can use them (the mock builds its transcript from the guide). */
  guide: GuideDoc | null;
  participantCount: number;
  seed: string;
};

export type TranscriptionResult = { language: string | null; segments: SegmentInput[] };

/** Anything that turns a recording into timed, speaker-labelled segments. */
export interface TranscriptionProvider {
  readonly name: string;
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}

/**
 * Which transcription to use:
 * - TRANSCRIPTION_PROVIDER=openai: any OpenAI-compatible `/audio/transcriptions` endpoint.
 * - TRANSCRIPTION_PROVIDER=gemini, or nothing set while Lyze AI uses a Gemini key: Gemini, with
 *   speakers and timestamps (TRANSCRIPTION_API_KEY overrides the key, TRANSCRIPTION_MODEL the model).
 * - TRANSCRIPTION_PROVIDER=mock, or nothing available in development: made-up transcripts.
 * - Nothing available in production: a clear error instead of a fake transcript.
 */
export function transcriptionProvider(): TranscriptionProvider {
  const choice = process.env.TRANSCRIPTION_PROVIDER?.trim();
  if (choice === "openai") return openAiProvider();
  if (choice === "mock") return mockProvider();
  const lyze = lyzeCredentials();
  const key = choice === "gemini" ? process.env.TRANSCRIPTION_API_KEY?.trim() || (lyze?.provider === "gemini" ? lyze.apiKey : "") : lyze?.provider === "gemini" ? lyze.apiKey : "";
  if (key) {
    const model = process.env.TRANSCRIPTION_MODEL?.trim() || (lyze?.provider === "gemini" ? lyze.model : "") || LYZE_DEFAULT_MODEL;
    return geminiProvider({ apiKey: key, model, fallbackModel: model === LYZE_FALLBACK_MODEL ? null : LYZE_FALLBACK_MODEL });
  }
  return process.env.NODE_ENV === "production" ? unavailableProvider() : mockProvider();
}

/** No speech-to-text configured: fail clearly rather than invent a transcript. */
function unavailableProvider(): TranscriptionProvider {
  return {
    name: "none",
    async transcribe() {
      throw new Error("Transcription isn't set up on this server. Set LYZE_AI_KEY (a Gemini key) or TRANSCRIPTION_PROVIDER.");
    },
  };
}
