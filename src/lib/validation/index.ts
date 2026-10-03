import { z } from "zod";
import { ROLES } from "@/lib/permissions";
import { PROJECT_COLORS, STUDY_STATUSES, STUDY_TYPES } from "@/lib/studies";
import { RESERVED_SLUGS, SLUG_PATTERN } from "@/lib/slug";

// Error messages are i18n keys (resolved under the `validation` namespace).

const name = (max: number) =>
  z.string().trim().min(1, { error: "required" }).max(max, { error: "tooLong" });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "tooLong" })
    .optional()
    .transform((v) => (v ? v : undefined));

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: "email" }));

export const signInSchema = z.object({ email: emailSchema });

/** 3–32 characters: letters, digits, dot, dash, underscore; starts with a letter or digit. Case-insensitive. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { error: "usernameShort" })
  .max(32, { error: "tooLong" })
  .regex(/^[a-z0-9][a-z0-9._-]*$/, { error: "username" });

export const passwordSchema = z.string().min(8, { error: "passwordShort" }).max(200, { error: "tooLong" });

export const passwordSignInSchema = z.object({ username: usernameSchema, password: z.string().min(1, { error: "required" }).max(200) });

export const signUpSchema = z.object({
  name: optionalText(80),
  username: usernameSchema,
  password: passwordSchema,
});
export type SignUpInput = z.input<typeof signUpSchema>;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_PATTERN, { error: "slug" })
  .refine((s) => !RESERVED_SLUGS.has(s), { error: "slugReserved" });

export const createWorkspaceSchema = z.object({
  name: name(60),
  withDemo: z.boolean().default(false),
});
export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  name: name(60),
  slug: slugSchema,
});
export type UpdateWorkspaceInput = z.input<typeof updateWorkspaceSchema>;

export const projectSchema = z.object({
  name: name(80),
  description: optionalText(500),
  color: z.enum(PROJECT_COLORS).default("violet"),
});
export type ProjectInput = z.input<typeof projectSchema>;

export const studySchema = z.object({
  name: name(80),
  description: optionalText(1000),
  type: z.enum(STUDY_TYPES),
});
export type StudyInput = z.input<typeof studySchema>;

export const studyUpdateSchema = studySchema.omit({ type: true }).extend({
  status: z.enum(STUDY_STATUSES),
});
export type StudyUpdateInput = z.input<typeof studyUpdateSchema>;

export const inviteSchema = z.object({
  /** An email address (sends an invite link) or a username (adds an existing account right away). */
  email: z.string().trim().toLowerCase().pipe(z.union([z.email(), usernameSchema], { error: "emailOrUsername" })),
  role: z.enum(ROLES).exclude(["owner"]),
});
export type InviteInput = z.input<typeof inviteSchema>;

export const roleChangeSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
});

export const profileSchema = z.object({
  name: name(80),
});
export type ProfileInput = z.input<typeof profileSchema>;
