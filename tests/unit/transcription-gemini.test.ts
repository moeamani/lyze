import { afterEach, describe, expect, it } from "vitest";
import { geminiProvider, parseTurns } from "@/server/transcription/gemini";
import { transcriptionProvider } from "@/server/transcription";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("Gemini transcription", () => {
  it("uploads the recording, asks for speakers and times, and deletes the file afterwards", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.endsWith("/upload/v1beta/files")) return new Response("{}", { headers: { "x-goog-upload-url": "https://upload.example/session1" } });
      if (url === "https://upload.example/session1") return Response.json({ file: { name: "files/abc", uri: "https://files/abc", mimeType: "audio/mp4", state: "ACTIVE" } });
      if (url.includes(":generateContent"))
        return Response.json({
          candidates: [{ content: { parts: [{ text: JSON.stringify([{ speaker: "S1", start: "00:00", end: "00:02", text: "Thanks for coming." }, { speaker: "S2", start: "00:03", end: "00:05", text: "Happy to." }, { speaker: "S2", start: "00:05", end: "00:07", text: "Shall we start?" }]) }] } }],
        });
      if (method === "DELETE") return new Response("{}");
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    // postJson uses the global fetch for the model call.
    const realFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
      const r = await geminiProvider({ apiKey: "k", model: "gemini-x" }, fakeFetch).transcribe({ media: new Uint8Array([1, 2, 3]), mime: "audio/mp4", filename: "a.m4a", durationMs: 7000, guide: null, participantCount: 1, seed: "s" });
      expect(r.segments).toEqual([
        { speaker: "S1", startMs: 0, endMs: 2000, text: "Thanks for coming." },
        { speaker: "S2", startMs: 3000, endMs: 7000, text: "Happy to. Shall we start?" },
      ]);
    } finally {
      globalThis.fetch = realFetch;
    }
    const prompt = calls.find((c) => c.url.includes(":generateContent"))!.body!;
    expect(prompt).toContain("files/abc".replace("files/", "https://files/"));
    expect(prompt).toContain("Label speakers S1, S2");
    expect(calls.at(-1)).toMatchObject({ url: "https://generativelanguage.googleapis.com/v1beta/files/abc", method: "DELETE" });
  });

  it("keeps every complete turn when the reply was cut off, and reads hour-long times", () => {
    const cut = '[{"speaker":"S1","start":"01:02:03","end":"01:02:09","text":"Long interview."},{"speaker":"S2","start":"01:02:10","text":"Cut of';
    expect(parseTurns(cut)).toEqual([{ speaker: "S1", startMs: 3723000, endMs: 3729000, text: "Long interview." }]);
    expect(() => parseTurns("nothing")).toThrow();
  });

  it("uses Gemini when Lyze AI has a Gemini key, and never fakes transcripts in production", () => {
    delete process.env.TRANSCRIPTION_PROVIDER;
    process.env.LYZE_AI_KEY = "AQ.key";
    expect(transcriptionProvider().name).toBe("gemini");
    delete process.env.LYZE_AI_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(transcriptionProvider().name).toBe("mock");
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(transcriptionProvider().name).toBe("none");
    process.env.TRANSCRIPTION_PROVIDER = "openai";
    expect(transcriptionProvider().name).toBe("openai");
  });
});
