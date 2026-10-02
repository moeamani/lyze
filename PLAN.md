# Lyze — Build Plan

Lyze is a calm, minimal tool for collecting and analyzing research data:
forms and surveys, interviews, and the quantitative, qualitative and
mixed-methods analysis that follows.

This document is the working plan. Decisions made along the way are recorded
in [Decisions log](#decisions-log) so the reasoning stays visible.

---

## 1. Architecture

```
┌──────────────────────── Next.js 16 (App Router, RSC) ────────────────────────┐
│                                                                              │
│  app/(marketing)   app/(auth)    app/(app)/w/[ws]/…     app/f/[id]  app/r/…   │
│  landing           sign-in       authenticated shell    respondent  shared   │
│                                  (sidebar / tab bar)    forms       reports  │
│                                                                              │
│  Server Components read via  src/server/queries/*  (role-checked)            │
│  Mutations are Server Actions in src/server/actions/* (Zod-validated,        │
│  role-checked, audit-logged) → revalidatePath                                │
│  Route handlers only for: auth, public API (/api/v1, API key), webhooks,     │
│  file upload/download, exports                                               │
│                                                                              │
│  src/lib/*  pure, framework-free logic (stats, logic engine, permissions,    │
│             slugs, text analysis) → unit tested with Vitest                  │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ Drizzle ORM (pg-core schema, one dialect)
          ┌─────────────────────┴───────────────────────┐
          │ DATABASE_URL set → node-postgres (Postgres) │
          │ unset            → PGlite (embedded PG, dev)│
          └─────────────────────────────────────────────┘
   Storage adapter: S3-compatible (prod) | local disk ./.data/uploads (dev)
   Providers behind interfaces: Transcription (mock | real), AI assist (mock | real),
   Mailer (console/dev mailbox | SMTP)
```

### Layers

| Layer | Location | Notes |
| --- | --- | --- |
| UI primitives | `src/components/ui` | shadcn/ui (new-york, Radix) source, vendored |
| App components | `src/components/{shell,…}` | composed from primitives only |
| Routes | `src/app` | thin: fetch via queries, render components |
| Server actions | `src/server/actions` | `"use server"`; validate → authorize → mutate → audit |
| Queries | `src/server/queries` | read-only, always scoped by membership |
| Auth | `src/server/auth.ts` | Auth.js v5, Drizzle adapter, DB sessions |
| DB | `src/server/db` | schema, client, migrations, seed |
| Pure logic | `src/lib` | no React / Next imports; heavily unit tested |
| i18n | `messages/*.json`, `src/i18n` | next-intl, locale from cookie / Accept-Language |

### Authorization model

Every query and action resolves `(user, workspace) → role` and checks it with
`can(role, permission)` from `src/lib/permissions.ts`.

| Permission | owner | editor | analyst | viewer |
| --- | :-: | :-: | :-: | :-: |
| view workspace / projects / studies / results | ✓ | ✓ | ✓ | ✓ |
| analyze (code, tag, memo, insights, reports) | ✓ | ✓ | ✓ | |
| edit (projects, studies, forms, guides, participants) | ✓ | ✓ | | |
| manage members, API keys, webhooks, delete workspace | ✓ | | | |

---

## 2. Data model

All ids are text (`nanoid`-style, prefixed where useful). Timestamps are
`timestamptz`. Soft deletes are avoided; deletes cascade and are audit-logged.
Phases add tables as they need them (migrations per phase).

| Table | Key columns | Phase |
| --- | --- | --- |
| `users` | id, name, email, emailVerified, image, locale | 1 |
| `accounts`, `sessions`, `verification_tokens` | Auth.js standard | 1 |
| `workspaces` | id, name, slug (unique), createdById | 1 |
| `memberships` | workspaceId, userId, role(owner/editor/analyst/viewer) | 1 |
| `invites` | workspaceId, email, role, token, expiresAt, acceptedAt | 1 |
| `projects` | workspaceId, name, description, color, archivedAt | 1 |
| `studies` | projectId, workspaceId, name, type(survey/interview/mixed/observation/diary), status(draft/live/closed), description | 1 |
| `audit_events` | workspaceId, actorId, action, entityType, entityId, metadata(jsonb) | 1 |
| `forms` | studyId, title, settings(jsonb: theme, progress bar, resume, languages, one-response mode, quotas), publicId, publishedVersion | 2 |
| `form_versions` | formId, version, snapshot(jsonb) — respondents answer an immutable snapshot | 2 |
| `questions` | formId, pageId, position, type, title, description, required, config(jsonb), dataKind(quant/qual), translations(jsonb) | 2 |
| `form_pages` | formId, position, title | 2 |
| `logic_rules` | formId, sourceQuestionId, condition(jsonb), action(show/hide/skip_to/end), target | 2 |
| `participants` | workspaceId, studyId?, externalId, name, email, attributes(jsonb), status, consentAt, anonymized | 2/4 |
| `responses` | formId, formVersion, participantId?, status(partial/complete), resumeToken, startedAt, submittedAt, durationMs, meta(jsonb: ua, locale), flagged | 2 |
| `answers` | responseId, questionId, value(jsonb), numeric (for fast stats), text (for search) | 2 |
| `derived_variables` / `recodes` | studyId, name, definition(jsonb) | 3 |
| `interview_guides` / `guide_items` | studyId, topic, question, probes, minutes, position | 4 |
| `sessions_` (`research_sessions`) | studyId, participantId, kind(interview/focus_group/field_notes/diary), scheduledAt, status, mediaFileId, notes | 4 |
| `transcripts` | sessionId, provider, status, language | 4 |
| `segments` | transcriptId?, answerId?, speaker, startMs, endMs, text, position | 4 |
| `session_notes` | sessionId, atMs, tag, text, authorId | 4 |
| `codes` | studyId/projectId, parentId, name, color, definition, position | 5 |
| `code_applications` | codeId, segmentId \| answerId, startOffset, endOffset, quote, createdById, source(human/ai), approvedAt | 5 |
| `themes` / `theme_codes` | projectId, name, description, column(kanban), position | 5 |
| `memos` | workspaceId, target(type,id), body, authorId | 5 |
| `insights` | projectId, kind(chart/quote/theme/stat), payload(jsonb), note | 7 |
| `reports` / `report_blocks` | projectId, title, shareToken, blocks(type, config, position) | 7 |
| `files` | workspaceId, key, name, mime, size, storage(s3/local) | 2/4 |
| `api_keys` | workspaceId, name, hashedKey, prefix, lastUsedAt | 8 |
| `webhooks` | workspaceId, url, secret, events[] | 8 |

---

## 3. Route map

| Route | Purpose |
| --- | --- |
| `/` | Landing (redirects to last workspace when signed in) |
| `/sign-in`, `/sign-in/check-email` | Magic link + Google |
| `/dev/mailbox` | **Dev only**: latest magic links (no SMTP needed; used by e2e) |
| `/onboarding` | Create first workspace, then seed demo study |
| `/w/[ws]` | Workspace dashboard: recent studies, response counts, quick actions |
| `/w/[ws]/projects` | Project list + create |
| `/w/[ws]/p/[projectId]` | Project overview: studies |
| `/w/[ws]/p/[projectId]/s/[studyId]` | Study overview (type-aware tabs) |
| `…/s/[studyId]/build` | Form builder (Phase 2) |
| `…/s/[studyId]/distribute` | Link, QR, embed, invites (Phase 2) |
| `…/s/[studyId]/responses` | Table + summaries + charts (Phase 3) |
| `…/s/[studyId]/analyze` | Crosstabs, stats, cleaning (Phase 3) |
| `…/s/[studyId]/guide`, `/participants`, `/sessions/[sid]` | Interviews (Phase 4) |
| `/w/[ws]/p/[projectId]/codebook`, `/coding`, `/themes`, `/search` | Qualitative (Phase 5) |
| `/w/[ws]/p/[projectId]/mixed` | Joint displays, triangulation (Phase 6) |
| `/w/[ws]/p/[projectId]/reports/[id]` | Report builder (Phase 7) |
| `/w/[ws]/settings`, `/settings/members`, `/settings/api` | Workspace settings |
| `/account` | Profile, locale, data export, delete my data |
| `/f/[publicId]` | Respondent form (lightweight, no app shell) |
| `/r/[shareToken]` | Read-only shared report |
| `/api/auth/[...nextauth]` | Auth.js |
| `/api/v1/*` | Public API (API key) |

---

## 4. Build phases

Each phase ends with `npm run lint`, `npm run typecheck`, `npm test`
(and Playwright where flows exist), then a commit.

1. **Foundation** — repo, tokens (light/dark), shadcn primitives, layout shell
   (collapsible sidebar on desktop, bottom tab bar + sheet on mobile, Cmd/Ctrl+K
   palette), i18n scaffolding, Auth.js (magic link + Google), workspace /
   project / study CRUD, roles, audit log.
2. **Forms** — builder (dnd-kit, canvas + settings, mobile/desktop preview),
   all question types, logic engine, pages, distribution, respondent form,
   save-and-resume, spam protection, response storage.
3. **Quantitative** — response table, per-question summaries, charts, crosstabs,
   stats tests with plain-language results, data cleaning.
4. **Interviews** — guides, participants, sessions, upload, mock transcription,
   transcript viewer with synced playback, live notes.
5. **Qualitative coding** — codebook, coding, themes board, memos, search,
   AI-assist interface (mock), word frequency/sentiment.
6. **Mixed methods** — participant linking, chart → quotes, joint displays,
   triangulation.
7. **Reports** — insight cards, block report builder, exports, share links.
8. **Polish** — a11y and perf passes, empty states, onboarding, seed data, README.

---

## 5. Design system

- Tokens live in `src/app/globals.css` as CSS variables (`--background`,
  `--foreground`, `--primary`, `--muted`, `--border`, `--radius`, spacing
  rhythm), mapped into Tailwind v4 via `@theme inline`. Dark mode via
  `next-themes` (`class` strategy) overriding the same tokens.
- Palette: warm neutral greys (oklch, low chroma) + one accent — a soft
  violet-indigo (`oklch(0.55 0.17 280)` light / `oklch(0.72 0.14 280)` dark),
  tuned for WCAG AA on both backgrounds. Chart colors derive from the accent
  plus muted companions.
- Radius base `0.875rem` (`rounded-xl` on cards/inputs), subtle 1px borders,
  very light shadows.
- Font: Geist Sans (via the `geist` package — bundled, no network at build).
- Motion: 150–200ms ease-out; all transitions/animations disabled under
  `prefers-reduced-motion`.
- Layout uses logical properties (`ps-*`, `pe-*`, `ms-*`, `start-*`,
  `border-s`) so RTL works; `<html dir>` is set from the locale.

---

## 6. Testing strategy

- **Vitest** for `src/lib/*` (permissions, slugs, validation schemas, and later
  stats + logic engine) and for server services against an in-memory PGlite
  database (real SQL, no mocks).
- **Playwright** (mobile 360px + desktop 1280px projects) for main flows:
  sign in via dev mailbox → onboarding → create project/study; later build a
  form, submit on mobile, view results, code a transcript.

---

## Decisions log

| # | Decision | Why |
| --- | --- | --- |
| 1 | **Next.js 16** (latest), React 19, Tailwind v4 | Current stable; Turbopack default |
| 2 | **PGlite instead of SQLite for local dev** | Same Postgres dialect + Drizzle schema in dev, test and prod; no second schema to maintain; zero install. `DATABASE_URL` switches to real Postgres. |
| 3 | shadcn components are **vendored by hand** in `src/components/ui` | The shadcn registry host is blocked in the build sandbox; the components are the same open-source code shadcn would copy in (new-york v4 style, `radix-ui` package). |
| 4 | Auth.js v5 with **database sessions** | Revocable sessions, simple server-side `auth()`; no edge middleware needed — auth is enforced in the `(app)` layout and in every action/query. |
| 5 | Magic links in dev go to the **console and `/dev/mailbox`** | Works without SMTP; makes e2e sign-in deterministic. Disabled in production. Google sign-in appears only when `AUTH_GOOGLE_ID/SECRET` are set. |
| 6 | Routes keyed by **workspace slug** (`/w/[ws]`) | Shareable, readable URLs; multi-workspace friendly. |
| 7 | **next-intl without locale-prefixed routes** | Locale comes from user preference/cookie/Accept-Language; keeps URLs (and respondent links) stable. Ships `en`; `ar` included to prove RTL. |
| 8 | Server Actions for mutations, small `ActionResult` type | Progressive enhancement, typed errors, Zod-validated on the server. |
| 9 | Form respondents answer an immutable **form version snapshot** | Editing a live form never corrupts existing responses or analysis. |
| 10 | Answers store `value` jsonb + denormalized `numeric` / `text` | Flexible per question type, but fast stats and full-text search. |
| 11 | TanStack Table pinned to **v8** | Stable API + shadcn data-table patterns. |
| 12 | Geist font from the `geist` npm package | Offline builds; one clean sans. |
