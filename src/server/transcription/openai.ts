import type { SegmentInput } from "@/lib/interviews/transcript";
import type { TranscriptionProvider } from "./index";

type VerboseSegment = { start: number; end: number; text: string; speaker?: string };
type VerboseResponse = { language?: string; text?: string; segments?: VerboseSegment[] };

/**
 * OpenAI-compatible speech-to-text (`POST {base}/audio/transcriptions`, `verbose_json`).
 * Env: TRANSCRIPTION_API_KEY, TRANSCRIPTION_API_URL (default https://api.openai.com/v1),
 * TRANSCRIPTION_MODEL (default whisper-1). Segments carry a speaker when the model diarizes;
 * otherwise everything is attributed to one speaker and can be split in the transcript editor.
 */
export function openAiProvider(fetchImpl: typeof fetch = fetch): TranscriptionProvider {
  const base = (process.env.TRANSCRIPTION_API_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const key = process.env.TRANSCRIPTION_API_KEY;
  const model = process.env.TRANSCRIPTION_MODEL || "whisper-1";
  return {
    name: "openai",
    async transcribe({ media, mime, filename, language }) {
      if (!key) throw new Error("TRANSCRIPTION_API_KEY is not set");
      const form = new FormData();
      form.set("file", new Blob([media as Uint8Array<ArrayBuffer>], { type: mime }), filename);
      form.set("model", model);
      form.set("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
      if (language) form.set("language", language);
      const res = await fetchImpl(`${base}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
      if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return parseVerbose((await res.json()) as VerboseResponse);
    },
  };
}

export function parseVerbose(body: VerboseResponse): { language: string | null; segments: SegmentInput[] } {
  const segments: SegmentInput[] = (body.segments ?? [])
    .filter((s) => s.text?.trim())
    .map((s) => ({
      speaker: s.speaker ? String(s.speaker) : "S1",
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      text: s.text.trim(),
    }));
  if (!segments.length && body.text?.trim()) segments.push({ speaker: "S1", startMs: 0, endMs: null, text: body.text.trim() });
  return { language: body.language ?? null, segments };
}
