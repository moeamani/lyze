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
| `forms` | studyId (unique), publicId, **draft (jsonb FormDoc)**, publishedVersion, publishedAt | 2 |
| `form_versions` | formId, version, doc(jsonb) — immutable snapshot respondents answer | 2 |
| `form_invites` | formId, email, token, sentAt — personal links for email invites | 2 |
| `participants` | workspaceId, studyId?, externalId, name, email, attributes(jsonb), status, consentAt, anonymized | 4 |
| `responses` | studyId, formId, formVersion, status(partial/complete/screened_out/over_quota), resumeToken, inviteId?, deviceId?, locale, currentPageId, quotaIds[], meta, startedAt, submittedAt, durationMs | 2 |
| `answers` | responseId, questionId, value(jsonb), numeric (for fast stats), text (for search); unique(responseId, questionId) | 2 |
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
| `files` | workspaceId, responseId?, storage(s3/local), key, name, mime, size | 2 |
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
| `…/s/[studyId]/build` | Form builder: canvas + settings panel, preview (Phase 2) |
| `…/s/[studyId]/share` | Link, QR, embed, email invites (Phase 2) |
| `…/s/[studyId]/responses`, `/responses/[id]` | Response grid (sort, search, columns) + detail with exclude (Phase 2–3) |
| `…/s/[studyId]/results` | Per-question summaries and charts, filter, compare-by (Phase 3) |
| `…/s/[studyId]/analyze?tool=` | Crosstab, compare groups, correlation, before/after, reliability, correlation matrix, prepare data (Phase 3) |
| `/api/studies/[studyId]/export?format=` | CSV, Excel, SPSS .sav, R bundle, REFI-QDA .qdpx (Phase 3) |
| `…/s/[studyId]/guide`, `/participants`, `/sessions/[sid]` | Interviews (Phase 4) |
| `/w/[ws]/p/[projectId]/codebook`, `/coding`, `/themes`, `/search` | Qualitative (Phase 5) |
| `/w/[ws]/p/[projectId]/mixed` | Joint displays, triangulation (Phase 6) |
| `/w/[ws]/p/[projectId]/reports/[id]` | Report builder (Phase 7) |
| `/w/[ws]/settings`, `/settings/members`, `/settings/api` | Workspace settings |
| `/account` | Profile, locale, data export, delete my data |
| `/f/[publicId]` | Respondent form (own root layout: no app shell/providers). `?lang=`, `?t=` invite, `?resume=`, `?embed=1` |
| `/r/[shareToken]` | Read-only shared report |
| `/api/auth/[...nextauth]` | Auth.js |
| `/api/f/[publicId]/{start,resume,save,submit,upload}` | Respondent API (rate-limited) |
| `/api/files/[id]` | Authenticated file download |
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

## Status

- [x] Phase 1 — Foundation
- [x] Phase 2 — Forms: builder, respondent form, responses
- [x] Phase 3 — Quantitative analysis + R / SPSS / NVivo / MAXQDA interoperability
- [ ] Phase 4 — Interviews
- [ ] Phase 5 — Qualitative coding
- [ ] Phase 6 — Mixed methods
- [ ] Phase 7 — Reports & exports
- [ ] Phase 8 — Polish

### Phase 2 notes

- `src/lib/forms/` is the heart of forms and is framework-free: `schema.ts` (Zod FormDoc),
  `answers.ts` (per-type answer validation + denormalized columns), `logic.ts` (visibility,
  dynamic required, skip/end navigation, full-submission validation), `piping.ts`, `random.ts`
  (seeded shuffles), `quotas.ts`, `i18n.ts` (per-language overlays), `templates.ts`.
- The respondent runner (`components/form-runner`) uses native inputs only (no Radix) and gets
  its strings as a plain object, so `/f/*` ships a small bundle. Lighthouse (mobile, local prod
  build): Performance 96, Accessibility 100, Best Practices 100 (SEO is low on purpose: forms are
  `noindex`).
- Builder state is one document with undo/redo and debounced autosave; publish validates and
  freezes a version. Logic UI: question-level show/hide/require, page-level skip/end.

### Phase 3 notes

- `src/lib/stats/` is a dependency-free statistics library: distributions (log-gamma, regularized
  incomplete beta/gamma, normal, t, F, χ²), descriptives (R type-7 quantiles, Tukey boxes, average
  ranks), and tests (χ² independence + Cramér's V + Fisher exact for 2×2, Welch/Student and paired
  t, Levene (median), one-way + Welch ANOVA with η²/ω², Mann–Whitney U, Kruskal–Wallis,
  Pearson/Spearman with Fisher-z CI, simple regression, Cronbach's α with item statistics). Every
  function is unit-tested against reference values computed with SciPy.
- `src/lib/analysis/` turns form versions + answers into an SPSS-style dataset: one variable per
  value (`Q1`, `Q3_2` dummies, `Q1_other`), measurement level, value labels, and metadata columns.
  Data preparation (include partial / screened-out, speeder cut-off, manual exclusions, recodes:
  group / reverse / bins, computed mean/sum scale scores) is stored per study and applies
  everywhere: Results, Analyze and every export. Raw answers are never changed.
- Every result has a plain-language sentence, an APA-style "how to report it" line, details,
  assumption checks (with automatic switch to rank-based tests when normality is doubtful), a
  chart with a table view, and the **equivalent R and SPSS syntax**.
- Charts follow the data-viz rules: validated 8-slot categorical palette (light + dark), diverging
  red ↔ gray ↔ blue for Likert, sequential heat for crosstabs, thin bars, one axis, legend only for
  2+ series, a table toggle on every chart (needed because the light palette's contrast check
  warns).
- New workspaces with the demo project get 48 deterministic responses (3 unfinished, a few
  speeders, built-in correlations) so Results and Analyze have something to show immediately.

### Coverage vs R, SPSS, NVivo, MAXQDA

| Tool | What Lyze does now | Later |
| --- | --- | --- |
| **SPSS** | Frequencies, descriptives, crosstabs + χ², t-tests, ANOVA, nonparametrics, correlations, reliability, recode / compute, select cases; SPSS syntax for each result; **.sav export** with variable labels, value labels, measurement levels, dates | Factor analysis, multiple/logistic regression, post-hoc tables |
| **R** | Same tests with R code for each result; **R bundle** (CSV + .sav + `lyze_import.R` that builds factors, ordered factors and labels) | Running R code inside Lyze is out of scope |
| **NVivo / ATLAS.ti / MAXQDA** | **REFI-QDA .qdpx** project: every open-text answer as a source, one code per question with the answer coded, cases with survey variables as case attributes (MAXQDA variant with CRLF line endings) | Full coding, codebook, memos and .qdc codebook exchange arrive in Phase 5 |
| **Excel / anything** | .xlsx (responses, codes, variable sheet) and CSV (labels or codes, UTF-8 BOM, formula-injection safe) | — |

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
| 13 | **Form definition is one JSON document** (pages → questions, logic, settings, translations) instead of question/page/rule tables | The builder edits and autosaves one object; Zod validates it whole; versions are trivial snapshots. Analysis reads question metadata from the version snapshot; answers are rows, so SQL stats stay easy. |
| 14 | **Two root layouts**: `(main)` app and `(respondent)` forms, plus `global-not-found` | Respondent pages skip app providers and translation payloads → fast on phones. |
| 15 | Respondent API = **route handlers** (`/api/f/...`), not Server Actions | Plain JSON contracts, per-route rate limits, multipart uploads, works from embeds. |
| 16 | Responses are created on the **first answer** (not on page view) and saved continuously | "Saved as they come in" without filling the table with empty bounces. |
| 17 | One-response modes: none / per device (browser id) / invite-only (personal token) | Device mode is soft protection, documented as such; invite mode is strict. Email-verified mode would need respondent auth — deferred. |
| 18 | Logic semantics: show-targets start hidden; hide wins; answers to hidden questions are ignored and pruned; skip/end rules belong to the last page their conditions reference; skips only go forward | Predictable, cycle-free, and identical on client and server (shared code). |
| 19 | Rate limiting is in-process memory; captcha is Cloudflare Turnstile (optional) | Zero-config single-instance default; swap in a shared store when scaling out. |
| 20 | Participants table deferred to Phase 4 | Phase 2 links responses to invites/devices; participant records arrive with interviews and are linked in Phase 6. |
| 21 | **Statistics implemented in-house** (`lib/stats`), verified against SciPy | No heavyweight numeric dependency in the server bundle; every formula is tested to 1e-6 against reference values. |
| 22 | Interoperability through **files + syntax**, not embedded R/SPSS | Researchers keep their tools: .sav for SPSS/jamovi/JASP/PSPP, an R bundle, REFI-QDA .qdpx for NVivo/ATLAS.ti/MAXQDA, and copy-paste R/SPSS syntax that reproduces each Lyze result. |
| 23 | .sav is written uncompressed, UTF-8, with long-name/very-long-string/measure/display records | Opens in SPSS ≥ 16, PSPP, R `haven`, Python `pyreadstat` (round-trip tested). String values are capped at 255 bytes; the full text stays in CSV/xlsx/qdpx. |
| 24 | .qdpx follows the REFI-QDA 1.5 project schema as implemented by QualCoder | Plain-text sources with code-point offsets, UTF-8 BOM, lowercase `sources/`; a CRLF variant for MAXQDA, which counts line breaks as two characters. Not yet verified inside the commercial apps. |
| 25 | Data preparation is a **saved per-study rule set**, not edits to answers | Reproducible and reversible; every view and export applies the same rules. |
| 26 | Analysis tool state lives in the **URL** | Results are linkable and survive refresh. |
