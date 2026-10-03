import { dispatchWebhooks } from "./api";
import { membersWithRoles, notify, studyLink } from "./notifications";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { interviewGuides, participants, studies } from "@/server/db/schema";
import { consentDocSchema, DEFAULT_CONSENT, emptyGuide, guideDocSchema, type ConsentDoc, type GuideDoc } from "@/lib/interviews/guide";
import { recordAudit } from "./audit";
import { requireWorkspace } from "./access";
import { AppError } from "./errors";
import { requireStudyIn } from "./participants";

export async function getGuide(workspaceId: string, studyId: string): Promise<{ doc: GuideDoc; consent: ConsentDoc | null; updatedAt: Date | null }> {
  await requireStudyIn(workspaceId, studyId);
  const [row] = await db.select().from(interviewGuides).where(eq(interviewGuides.studyId, studyId)).limit(1);
  return row ? { doc: guideDocSchema.parse(row.doc), consent: row.consent, updatedAt: row.updatedAt } : { doc: emptyGuide(), consent: null, updatedAt: null };
}

/** Autosaved from the guide builder, like a form draft. */
export async function saveGuide(userId: string, workspaceId: string, studyId: string, raw: unknown) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  await requireStudyIn(workspaceId, studyId);
  const doc = guideDocSchema.parse(raw);
  await db
    .insert(interviewGuides)
    .values({ studyId, workspaceId, doc })
    .onConflictDoUpdate({ target: interviewGuides.studyId, set: { doc, updatedAt: new Date() } });
  return doc;
}

const consentInputSchema = consentDocSchema.omit({ version: true }).extend({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  statements: z.array(z.string().trim().min(1).max(500)).max(20),
});

/** Save the consent form. Any change to the wording creates a new version. */
export async function saveConsent(userId: string, workspaceId: string, studyId: string, raw: unknown) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  await requireStudyIn(workspaceId, studyId);
  const input = consentInputSchema.parse(raw);
  const [row] = await db.select({ consent: interviewGuides.consent }).from(interviewGuides).where(eq(interviewGuides.studyId, studyId)).limit(1);
  const prev = row?.consent ?? null;
  const same = prev && prev.title === input.title && prev.body === input.body && JSON.stringify(prev.statements) === JSON.stringify(input.statements);
  if (same) return prev;
  const consent: ConsentDoc = { ...input, version: (prev?.version ?? 0) + 1 };
  await db
    .insert(interviewGuides)
    .values({ studyId, workspaceId, doc: emptyGuide(), consent })
    .onConflictDoUpdate({ target: interviewGuides.studyId, set: { consent, updatedAt: new Date() } });
  await recordAudit(db, { workspaceId, actorId: userId, action: "consent.updated", entityType: "study", entityId: studyId, metadata: { version: consent.version } });
  return consent;
}

export function defaultConsent(): Omit<ConsentDoc, "version"> {
  return structuredClone(DEFAULT_CONSENT);
}

// ── Public consent page (/consent/[token]) ─────────────────────────────────

export async function getConsentByToken(token: string) {
  if (!/^[A-Za-z0-9]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select({
      participantId: participants.id,
      code: participants.code,
      name: participants.name,
      consentAt: participants.consentAt,
      consentVersion: participants.consentVersion,
      consentName: participants.consentName,
      anonymizedAt: participants.anonymizedAt,
      studyName: studies.name,
      studyId: studies.id,
      workspaceId: studies.workspaceId,
      consent: interviewGuides.consent,
    })
    .from(participants)
    .innerJoin(studies, eq(studies.id, participants.studyId))
    .leftJoin(interviewGuides, eq(interviewGuides.studyId, participants.studyId))
    .where(eq(participants.consentToken, token))
    .limit(1);
  if (!row || !row.consent || row.anonymizedAt) return null;
  return { ...row, consent: row.consent, signedCurrent: !!row.consentAt && row.consentVersion === row.consent.version };
}

export const signConsentSchema = z.object({
  name: z.string().trim().min(2).max(200),
  agreed: z.array(z.number().int().min(0)).max(20),
  version: z.number().int().min(1),
});

/** The participant signs online: every statement ticked, typed name as signature. */
export async function signConsent(token: string, raw: unknown) {
  const input = signConsentSchema.parse(raw);
  const found = await getConsentByToken(token);
  if (!found) throw new AppError("notFound");
  // The form changed while they were reading: ask them to review the new version.
  if (input.version !== found.consent.version) throw new AppError("conflict");
  const ticked = new Set(input.agreed);
  if (found.consent.statements.some((_, i) => !ticked.has(i))) throw new AppError("invalid");
  await db
    .update(participants)
    .set({ consentAt: new Date(), consentMethod: "online", consentName: input.name, consentVersion: found.consent.version })
    .where(eq(participants.id, found.participantId));
  await recordAudit(db, {
    workspaceId: found.workspaceId,
    actorId: null,
    action: "participant.consent_signed",
    entityType: "participant",
    entityId: found.participantId,
    metadata: { code: found.code, version: found.consent.version },
  });
  const link = await studyLink(found.studyId);
  if (link) {
    const people = await membersWithRoles(found.workspaceId, ["owner", "editor"]);
    void dispatchWebhooks(found.workspaceId, "consent.signed", { participantId: found.participantId, studyId: found.studyId, version: found.consent.version });
    await notify(people, { workspaceId: found.workspaceId, kind: "consent", data: { code: found.code, study: link.studyName }, href: `${link.base}/participants/${found.participantId}` });
  }
}
