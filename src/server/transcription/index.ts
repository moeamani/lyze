import "server-only";
import type { GuideDoc } from "@/lib/interviews/guide";
import type { SegmentInput } from "@/lib/interviews/transcript";
import { mockProvider } from "./mock";
import { openAiProvider } from "./openai";

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
 * TRANSCRIPTION_PROVIDER=openai uses any OpenAI-compatible `/audio/transcriptions` endpoint
 * (OpenAI, Groq, a self-hosted Whisper server…). Anything else uses the mock provider.
 */
export function transcriptionProvider(): TranscriptionProvider {
  return process.env.TRANSCRIPTION_PROVIDER === "openai" ? openAiProvider() : mockProvider();
}
