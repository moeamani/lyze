import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  RespondentError,
  getPublicForm,
  resumeResponse,
  saveProgress,
  startResponse,
  submitResponse,
  uploadAnswerFile,
} from "@/server/services/respondent";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { verifyCaptcha } from "@/server/captcha";
import type { Answers, AnswerValue } from "@/lib/forms/answers";

// Respondent API for public forms: start → save (repeatedly) → submit. Uploads go through `upload`.

const token = z.string().min(10).max(100);
const answersShape = z.record(z.string().max(64), z.unknown());

const bodies = {
  start: z.object({
    deviceId: z.string().max(64).optional(),
    invite: z.string().max(100).optional(),
    locale: z.string().max(10).optional(),
    embed: z.boolean().optional(),
  }),
  resume: z.object({ token }),
  save: z.object({ token, answers: answersShape, pageId: z.string().max(64).optional() }),
  submit: z.object({
    token,
    answers: answersShape,
    website: z.string().max(200).optional(), // honeypot: humans never see this field
    captcha: z.string().max(4000).optional(),
  }),
};

const LIMITS: Record<string, [number, number]> = {
  start: [20, 60_000],
  resume: [60, 60_000],
  save: [240, 60_000],
  submit: [20, 60_000],
  upload: [30, 60_000],
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

function fail(error: unknown) {
  if (error instanceof RespondentError) {
    const status = error.code === "notFound" ? 404 : error.code === "closed" || error.code === "alreadyResponded" ? 409 : 400;
    return json({ error: error.code, details: error.details }, status);
  }
  if (error instanceof z.ZodError) return json({ error: "invalid" }, 400);
  console.error(error);
  return json({ error: "server" }, 500);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/f/[publicId]/[action]">) {
  const { publicId, action } = await ctx.params;
  if (!(action in LIMITS)) return json({ error: "notFound" }, 404);

  const ip = clientKey(request.headers);
  const [limit, windowMs] = LIMITS[action]!;
  const rl = rateLimit(`${action}:${ip}`, limit, windowMs);
  if (!rl.ok) return NextResponse.json({ error: "rateLimited" }, { status: 429, headers: { "retry-after": String(rl.retryAfter) } });

  try {
    if (action === "upload") {
      const form = await request.formData();
      const file = form.get("file");
      const t = token.parse(form.get("token"));
      const questionId = z.string().max(64).parse(form.get("questionId"));
      if (!(file instanceof File)) return json({ error: "invalid" }, 400);
      return json(await uploadAnswerFile(publicId, t, questionId, file));
    }

    const raw = await request.json().catch(() => ({}));
    switch (action) {
      case "start": {
        const body = bodies.start.parse(raw);
        const state = await startResponse(publicId, {
          deviceId: body.deviceId,
          inviteToken: body.invite,
          locale: body.locale,
          embed: body.embed,
          userAgent: request.headers.get("user-agent") ?? undefined,
          referrer: request.headers.get("referer") ?? undefined,
        });
        return json(state);
      }
      case "resume": {
        const body = bodies.resume.parse(raw);
        return json(await resumeResponse(publicId, body.token));
      }
      case "save": {
        const body = bodies.save.parse(raw);
        await saveProgress(publicId, body.token, { answers: body.answers as Record<string, AnswerValue | null>, pageId: body.pageId });
        return json({ ok: true });
      }
      case "submit": {
        const body = bodies.submit.parse(raw);
        // Bots fill every field. Pretend success so they don't adapt, but store nothing.
        if (body.website) return json({ status: "complete" });
        const form = await getPublicForm(publicId);
        if (form?.doc.settings.captcha && !(await verifyCaptcha(body.captcha, ip))) return json({ error: "captcha" }, 400);
        return json(await submitResponse(publicId, body.token, body.answers as Answers));
      }
    }
    return json({ error: "notFound" }, 404);
  } catch (error) {
    return fail(error);
  }
}
