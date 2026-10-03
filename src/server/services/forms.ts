import { and, desc, eq, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "@/server/db";
import { forms, formVersions, studies, type Form } from "@/server/db/schema";
import { formDocSchema, type FormDoc } from "@/lib/forms/schema";
import { emptyForm, publishIssues, type PublishIssue } from "@/lib/forms/questions";
import { TEMPLATES, type TemplateKey } from "@/lib/forms/templates";
import { collectsResponses } from "@/lib/studies";
import { stableStringify } from "@/lib/stable-json";
import { recordAudit } from "./audit";
import { requireWorkspace } from "./access";
import { AppError } from "./errors";
import { getStudy } from "./studies";

const publicId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

export async function getFormForStudy(workspaceId: string, studyId: string): Promise<Form | null> {
  const [form] = await db
    .select()
    .from(forms)
    .where(and(eq(forms.workspaceId, workspaceId), eq(forms.studyId, studyId)))
    .limit(1);
  return form ?? null;
}

async function requireForm(workspaceId: string, formId: string) {
  const [form] = await db
    .select()
    .from(forms)
    .where(and(eq(forms.id, formId), eq(forms.workspaceId, workspaceId)))
    .limit(1);
  if (!form) throw new AppError("notFound");
  return form;
}

export async function createForm(
  userId: string,
  workspaceId: string,
  projectId: string,
  studyId: string,
  template: TemplateKey | "blank" | { doc: FormDoc; how: "generated" | "import" },
) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const study = await getStudy(workspaceId, projectId, studyId);
  if (!collectsResponses(study.type)) throw new AppError("invalid");
  const existing = await getFormForStudy(workspaceId, studyId);
  if (existing) return existing;

  const doc = typeof template === "object" ? template.doc : template === "blank" ? emptyForm(study.name) : TEMPLATES[template]();
  if (template === "blank") doc.description = study.description ?? undefined;

  return db.transaction(async (tx) => {
    const [form] = await tx
      .insert(forms)
      .values({ workspaceId, studyId, publicId: publicId(), draft: formDocSchema.parse(doc) })
      .returning();
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: "form.created",
      entityType: "form",
      entityId: form!.id,
      metadata: { name: study.name, template: typeof template === "object" ? template.how : template },
    });
    return form!;
  });
}

/** Create a published form for a study in one go (used for demo data). */
export async function createPublishedForm(
  executor: Pick<typeof db, "insert">,
  input: { workspaceId: string; studyId: string; doc: FormDoc; userId: string },
) {
  const [form] = await executor
    .insert(forms)
    .values({
      workspaceId: input.workspaceId,
      studyId: input.studyId,
      publicId: publicId(),
      draft: input.doc,
      publishedVersion: 1,
      publishedAt: new Date(),
    })
    .returning();
  await executor.insert(formVersions).values({ formId: form!.id, version: 1, doc: input.doc, publishedById: input.userId });
  return form!;
}

export async function saveDraft(userId: string, workspaceId: string, formId: string, raw: unknown) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const form = await requireForm(workspaceId, formId);
  const doc = formDocSchema.parse(raw);
  const [saved] = await db
    .update(forms)
    .set({ draft: doc })
    .where(eq(forms.id, form.id))
    .returning({ updatedAt: forms.updatedAt });
  return { updatedAt: saved!.updatedAt };
}

export class PublishError extends AppError {
  constructor(public readonly issues: PublishIssue[]) {
    super("invalid", "Form has publish issues");
  }
}

export async function publishForm(userId: string, workspaceId: string, formId: string) {
  await requireWorkspace(userId, workspaceId, "content:edit");
  const form = await requireForm(workspaceId, formId);
  const doc = formDocSchema.parse(form.draft);
  const issues = publishIssues(doc);
  if (issues.length) throw new PublishError(issues);

  return db.transaction(async (tx) => {
    const [{ next }] = (await tx
      .select({ next: sql<number>`coalesce(max(${formVersions.version}), 0)::int + 1` })
      .from(formVersions)
      .where(eq(formVersions.formId, form.id))) as [{ next: number }];
    await tx.insert(formVersions).values({ formId: form.id, version: next, doc, publishedById: userId });
    await tx.update(forms).set({ publishedVersion: next, publishedAt: new Date() }).where(eq(forms.id, form.id));
    // Publishing a draft study opens it for responses.
    await tx
      .update(studies)
      .set({ status: "live" })
      .where(and(eq(studies.id, form.studyId), eq(studies.status, "draft")));
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: "form.published",
      entityType: "form",
      entityId: form.id,
      metadata: { name: doc.title, version: next },
    });
    return { version: next };
  });
}

export async function getPublishedDoc(formId: string, version: number): Promise<FormDoc | null> {
  const [row] = await db
    .select({ doc: formVersions.doc })
    .from(formVersions)
    .where(and(eq(formVersions.formId, formId), eq(formVersions.version, version)))
    .limit(1);
  return row?.doc ?? null;
}

export async function latestVersions(formId: string, limit = 10) {
  return db
    .select({ version: formVersions.version, createdAt: formVersions.createdAt })
    .from(formVersions)
    .where(eq(formVersions.formId, formId))
    .orderBy(desc(formVersions.version))
    .limit(limit);
}

/** Whether the draft has edits that aren't published yet. */
export async function hasUnpublishedChanges(form: Form): Promise<boolean> {
  if (!form.publishedVersion) return true;
  const published = await getPublishedDoc(form.id, form.publishedVersion);
  return stableStringify(published) !== stableStringify(form.draft);
}
