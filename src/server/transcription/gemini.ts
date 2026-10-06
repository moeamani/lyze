import { mergeCues, type SegmentInput } from "@/lib/interviews/transcript";
import { parseTimestamp } from "@/lib/interviews/time";
import { isBusy, postJson } from "@/server/ai/llm";
import type { TranscriptionProvider } from "./index";

const API = "https://generativelanguage.googleapis.com";

/** One turn as the model returns it (times as "MM:SS" or "HH:MM:SS" from the start). */
type Turn = { speaker?: string; start?: string; end?: string; text?: string };

/**
 * Transcription with Google Gemini, which listens to the whole recording: who spoke (S1, S2…),
 * when, and what they said, verbatim and in the language spoken. The recording goes up through the
 * Files API (long interviews are fine) and is deleted from Google straight after.
 */
export function geminiProvider(cfg: { apiKey: string; model: string; fallbackModel?: string | null }, fetchImpl: typeof fetch = fetch): TranscriptionProvider {
  const headers = { "x-goog-api-key": cfg.apiKey };

  async function upload(media: Uint8Array, mime: string, name: string) {
    const start = await fetchImpl(`${API}/upload/v1beta/files`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", "x-goog-upload-protocol": "resumable", "x-goog-upload-command": "start", "x-goog-upload-header-content-length": String(media.byteLength), "x-goog-upload-header-content-type": mime },
      body: JSON.stringify({ file: { display_name: name.slice(0, 100) || "recording" } }),
    });
    const uploadUrl = start.headers.get("x-goog-upload-url");
    if (!start.ok || !uploadUrl) throw Object.assign(new Error(`Could not start the upload to Gemini (${start.status})`), { status: start.status });
    const done = await fetchImpl(uploadUrl, { method: "POST", headers: { "x-goog-upload-offset": "0", "x-goog-upload-command": "upload, finalize" }, body: media as Uint8Array<ArrayBuffer> });
    if (!done.ok) throw Object.assign(new Error(`Uploading the recording to Gemini failed (${done.status})`), { status: done.status });
    let file = ((await done.json()) as { file: { name: string; uri: string; mimeType: string; state?: string } }).file;
    // Audio is usually ready at once; video takes a moment to process.
    for (let i = 0; file.state === "PROCESSING" && i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetchImpl(`${API}/v1beta/${file.name}`, { headers });
      if (res.ok) file = (await res.json()) as typeof file;
    }
    if (file.state === "FAILED") throw new Error("Gemini could not read this recording");
    return file;
  }

  async function ask(model: string, file: { uri: string; mimeType: string }, prompt: string) {
    const data = await postJson(`${API}/v1beta/models/${encodeURIComponent(model)}:generateContent`, headers, {
      contents: [{ role: "user", parts: [{ file_data: { mime_type: file.mimeType, file_uri: file.uri } }, { text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 65536,
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: { type: "OBJECT", properties: { speaker: { type: "STRING" }, start: { type: "STRING" }, end: { type: "STRING" }, text: { type: "STRING" } }, required: ["speaker", "start", "text"] },
        },
      },
    });
    const candidate = (data.candidates as { content?: { parts?: { text?: string }[] }; finishReason?: string }[] | undefined)?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new Error(candidate?.finishReason === "SAFETY" ? "Gemini declined to transcribe this recording" : "Gemini returned no transcript");
    return text;
  }

  return {
    name: "gemini",
    async transcribe({ media, mime, filename, language, participantCount }) {
      const file = await upload(media, mime.split(";")[0]!.trim(), filename);
      try {
        const prompt = transcriptionPrompt(participantCount, language);
        let text: string;
        try {
          text = await ask(cfg.model, file, prompt);
        } catch (e) {
          if (!cfg.fallbackModel || !isBusy(e)) throw e;
          text = await ask(cfg.fallbackModel, file, prompt);
        }
        return { language: language ?? null, segments: parseTurns(text) };
      } finally {
        // Research recordings don't stay with Google longer than needed.
        await fetchImpl(`${API}/v1beta/${file.name}`, { method: "DELETE", headers }).catch(() => undefined);
      }
    },
  };
}

export function transcriptionPrompt(participants: number, language?: string | null) {
  return [
    "Transcribe this research interview recording verbatim.",
    `There are probably ${participants + 1} or more voices: an interviewer and ${participants === 1 ? "a participant" : `about ${participants} participants`}.`,
    "Start a new turn whenever the speaker changes. Label speakers S1, S2, S3… in the order they first speak, and keep each person's label the same throughout.",
    "Give each turn's start and end time from the beginning of the recording as MM:SS (or HH:MM:SS past an hour).",
    `Write what is said in the language it is spoken${language ? ` (mostly ${language})` : ""}. Don't translate, summarise, tidy grammar or drop filler words. Write unclear speech as [inaudible] and overlapping talk as [crosstalk].`,
    "Return only the JSON array of turns.",
  ].join("\n");
}

/** Turn the model's JSON into segments; a reply cut off at the length limit keeps every complete turn. */
export function parseTurns(text: string): SegmentInput[] {
  const body = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let turns: Turn[];
  try {
    turns = JSON.parse(body) as Turn[];
  } catch {
    const last = body.lastIndexOf("}");
    if (last < 0) throw new Error("Gemini's transcript couldn't be read");
    turns = JSON.parse(`${body.slice(0, last + 1)}]`) as Turn[];
  }
  if (!Array.isArray(turns)) throw new Error("Gemini's transcript couldn't be read");
  const time = (s?: string) => {
    if (!s) return null;
    const t = s.trim().replace(/^(\d+):(\d{2})$/, "0:$1:$2");
    return parseTimestamp(t) ?? parseTimestamp(s.trim());
  };
  // The model sometimes splits one person's turn into sentences: join them back up.
  return mergeCues(
    turns.filter((t) => t.text?.trim()).map((t) => ({ speaker: (t.speaker || "S1").trim().slice(0, 40), startMs: time(t.start), endMs: time(t.end), text: t.text!.trim().slice(0, 4000) })),
    2500,
  );
}
