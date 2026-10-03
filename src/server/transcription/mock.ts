import { mockTranscript } from "@/lib/interviews/mock-transcript";
import type { TranscriptionProvider } from "./index";

/** Development provider: no network, deterministic output shaped by the interview guide. */
export function mockProvider(): TranscriptionProvider {
  return {
    name: "mock",
    async transcribe({ guide, durationMs, seed, participantCount }) {
      return { language: "en", segments: mockTranscript({ guide, durationMs, seed, participants: participantCount }) };
    },
  };
}
