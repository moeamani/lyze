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
| `participants` | workspaceId, studyId, code (P01…), name, email, phone, externalId, attributes(jsonb), status, notes, consent token/at/method/name/version, anonymizedAt | 4 |
| `responses` | studyId, formId, formVersion, status(partial/complete/screened_out/over_quota), resumeToken, inviteId?, deviceId?, locale, currentPageId, quotaIds[], meta, startedAt, submittedAt, durationMs | 2 |
| `answers` | responseId, questionId, value(jsonb), numeric (for fast stats), text (for search); unique(responseId, questionId) | 2 |
| `derived_variables` / `recodes` | studyId, name, definition(jsonb) | 3 |
| `interview_guides` | studyId (PK), **doc (jsonb GuideDoc: intro, sections → questions → probes, minutes, outro)**, consent (jsonb, versioned) | 4 |
| `research_sessions` | studyId, kind(interview/focus_group/field_notes/diary), title, status, scheduledAt, durationMin, location, interviewerId, mediaFileId, mediaDurationMs, startedAt, endedAt, summary | 4 |
| `session_participants` | sessionId, participantId (focus groups have several) | 4 |
| `transcripts` | sessionId (unique), provider (mock/openai/import/manual), status, language, speakers (jsonb: S1… → name, role, participantId) | 4 |
| `segments` | transcriptId, position, speaker, startMs, endMs, text (open-text answers are coded in place in Phase 5) | 4 |
| `session_notes` | sessionId, atMs, tag, text, authorId | 4 |
| `codes` | **projectId** (codes span every study in the project), parentId (≤ 4 levels), name (unique among siblings), color (slot 1–8), definition, position, themeId?, themePosition | 5 |
| `code_applications` | codeId, segmentId \| answerId, start, end (UTF-16 offsets into that one unit), quote, createdById, source(human/ai), approvedAt (null = pending suggestion), reason, starred | 5 |
| `themes` | projectId, name, description, color, position — codes hang off themes via `codes.themeId` (one theme per code), so the board is just ordered columns | 5 |
| `memos` | workspaceId, projectId, target(project/code/theme/segment/answer/session, id), title, body, authorId | 5 |
| `project_groups` | workspaceId, name, position — custom folders; `projects.groupId` (set null on delete) | 6 |
| `responses.participantId` | links a survey response to a participant (auto via personal email invite) | 6 |
| `project_briefs` | projectId (PK), aim, questions jsonb, statements jsonb (hypothesis/proposition/assumption), proposal file + extracted text | 6 |
| `writeups` | projectId, title, body (Markdown), provider, createdById | 6 |
| `notifications` | userId, workspaceId, kind, data jsonb, href, groupKey (repeats fold), readAt | 6 |
| `insights` | projectId, kind(chart/quote/theme/stat), payload(jsonb), note | 7 |
| `reports` | projectId, title, blocks jsonb (heading/text/question/quote/theme/joint/writeup; data blocks hold references), shareToken (null = private) | 7 |
| `responses.source` | respondent / manual / import / generated | 7 |
| `files` | workspaceId, responseId?, storage(s3/local), key, name, mime, size | 2 |
| `api_keys` | workspaceId, name, hashedKey (SHA-256; secret shown once), prefix, lastUsedAt | 8 |
| `webhooks` | workspaceId, url (public https only in production), secret (HMAC signing), events[], lastStatus | 8 |
| `workspace_ai` | workspaceId (PK), apiKeyEnc (AES-256-GCM, key from AUTH_SECRET), keyHint, model | 8 |

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
| `…/s/[studyId]/guide` (`?tab=consent`) | Interview guide builder and consent form (Phase 4) |
| `…/s/[studyId]/participants`, `/participants/[pid]` | Participants: pipeline, import, consent, anonymize (Phase 4) |
| `…/s/[studyId]/sessions`, `/sessions/[sid]` | Sessions list; player + synced transcript + notes (Phase 4) |
| `…/s/[studyId]/sessions/[sid]/live` | Live session: timer, in-browser recording, guide checklist, quick notes (Phase 4) |
| `/consent/[token]` | Participant's personal consent page (respondent layout) (Phase 4) |
| `/api/sessions/[sid]/media`, `/transcript?format=`, `/calendar` | Recording upload, transcript download (txt/vtt/srt), .ics (Phase 4) |
| `/w/[ws]/p/[projectId]` (+ tabs) | Project tabs: Studies, `/coding?doc=`, `/codebook?code=`, `/themes`, `/quotes?code=&theme=&study=&person=&starred=`, `/memos`, `/search?q=&in=&study=&person=&code=&from=&to=` (Phase 5) |
| `/api/projects/[projectId]/export?format=` | REFI-QDA `qdpx`, `qdpx-maxqda`, codebook `qdc`, quote bank `quotes` CSV (Phase 5) |
| `/w/[ws]/p/[projectId]/mixed?view=joint\|cross\|cases&q=` | Joint display, codes × closed answers, people across sources (Phase 6) |
| `/w/[ws]/p/[projectId]/writeup`, `/writeup/[id]` | Research brief + proposal, written analysis drafts (Phase 6) |
| `/w/[ws]/activity?cat=&actor=&from=&to=&q=&before=` | Activity with filters, day groups, paging (Phase 6) |
| `/w/[ws]/p/[projectId]/reports`, `/reports/[id]` | Report list (generate / blank) and builder with share, print, Markdown (Phase 7) |
| `/w/[ws]/settings`, `/settings/members`, `/settings/ai`, `/settings/api` | Workspace settings: general, members, AI key and model, API keys and webhooks |
| `/account` | Profile, locale, data export, delete my data |
| `/f/[publicId]` | Respondent form (own root layout: no app shell/providers). `?lang=`, `?t=` invite, `?resume=`, `?embed=1` |
| `/r/[shareToken]` | Read-only shared report, no sign-in, live data, print button (Phase 7) |
| `/api/auth/[...nextauth]` | Auth.js |
| `/api/f/[publicId]/{start,resume,save,submit,upload}` | Respondent API (rate-limited) |
| `/api/files/[id]` | Authenticated file download |
| `/api/v1/projects`, `/api/v1/studies/[id]/responses?format=json\|csv` | Public read-only API (Bearer API key) |
| `/api/account/export` | Download my data (JSON) |

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
- [x] Phase 4 — Interviews: guides, participants, consent, sessions, recording, transcription
- [x] Phase 5 — Qualitative coding
- [x] Phase 6 — Mixed methods, written analysis, groups, notifications, Persian, rebrand
- [x] Phase 7 — Reports & exports, plus Generate / Upload CSV / Enter manually everywhere
- [x] Phase 8 — AI settings, API & webhooks, account data, polish

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

### Phase 4 notes

- `src/lib/interviews/` is framework-free and unit-tested: guide documents and templates with
  timing, participant pipeline and CSV import, transcript import (WebVTT from Zoom/Teams, SRT,
  text in the common "Name: …" / `[00:01:02]` / Otter shapes) and export (txt, vtt, srt), `.ics`
  files, `#tag` note parsing and the mock transcriber.
- Transcription runs behind a `TranscriptionProvider` interface (`src/server/transcription`): the
  mock builds a deterministic interview from the study's guide, timed to the recording; the
  `openai` provider talks to any OpenAI-compatible `/audio/transcriptions` endpoint. Jobs run with
  `after()` once the upload response is sent; the session page polls until the transcript is ready.
- Speakers are normalized to S1…Sn and auto-assigned (names matching a participant link to them;
  otherwise the first voice is the interviewer). Linked participants are always shown by code.
- Playback sync: the file route serves byte ranges (206) so audio/video can seek; the transcript
  highlights and follows the playing segment; timestamps and timed notes jump the player.
- Live view: timer with optional in-browser audio recording (MediaRecorder, WebM/Opus or MP4),
  guide as a checklist with per-topic time budgets, notes stamped at the moment you start typing,
  quick tags (Alt+1–5). If an upload fails the recording is downloaded so nothing is lost.
- Consent: one versioned form per study; participants sign online at a personal link (every
  statement ticked + typed name), or researchers record verbal/written consent. Changing the
  wording makes a new version and older signatures show as outdated. Every step is audit-logged.
- Demo: the "Café regulars interviews" study is seeded with a guide, consent form, five people at
  different stages, two transcribed interviews with notes, one upcoming interview and field notes.
- Fixed along the way: grid tracks in the new pages use `minmax(0,1fr)` so nothing pushes the page
  sideways on phones (checked by e2e at 360px).

### Phase 5 notes

- `src/lib/qual/` is framework-free and unit-tested: code tree helpers (flatten, depth limit,
  cycle-safe moves, sibling name checks), offset ranges (normalize, snap to words, overlapping
  highlight spans, relocating codings when a segment is edited), search query parsing (`"phrases"`,
  `-exclude`, snippets), a lexicon sentiment scorer with negation and boosters, a deterministic
  word-cloud layout, and small NLP helpers (stemming, TF-IDF, k-means clustering, extractive
  summaries).
- **Coding workspace**: every ready transcript (interviews, focus groups, field notes, diaries) and
  every open-text survey question is a document. Select text → a picker to apply or create a code
  (keyboard friendly, recent codes first); click a highlight to star, remove or memo it. On phones
  each passage has a "Code" button and the codes panel is a bottom sheet. Editing a transcript
  segment moves its codings with the text; rewriting a field note keeps unchanged paragraphs.
- **Codebook**: nested codes with colors and definitions, reorder, merge (passages, children and
  memos move), split (tick passages → new code), and REFI-QDA codebook import/export.
- **Themes** board (dnd-kit, keyboard accessible) with an "Unsorted" column; **quote bank** with
  URL filters, starring, copy and CSV export; **memos** on the project, codes, themes, passages and
  sessions; **search** across transcripts, answers and memos with study/participant/code/date
  filters.
- **Assistant** behind `AssistProvider` (`src/server/ai`): the default built-in provider is
  deterministic (keyword suggestions from code names/definitions, TF-IDF clustering, extractive
  summaries, template theme descriptions). `AI_PROVIDER=claude` uses the Anthropic API with
  structured outputs. Suggestions are stored as pending codings and count nowhere until a person
  accepts them; summaries and drafts are shown for review before saving.
- Results for open-text questions gained a word cloud (one hue, opacity by frequency, with the bar
  view kept as the default and as the accessible alternative) and a tone bar (diverging
  red · gray · blue) with example answers. Sentiment is English-only.
- Demo: the coffee project ships a small codebook (Ritual › Pause, Social; Cutting down; Cost;
  Health & sleep), two themes, coded passages in both interviews and the survey, one pending
  suggestion and three memos.
- Also in this phase: the landing mascot is now a small 3D agent, and the respondent form was
  redesigned — each question is a centred card in a single column on every screen.

### Phase 6 notes

- **Mixed methods** (`/mixed`): a joint display that puts each code's weight in conversations
  (passages, people, a quote) beside its share of survey respondents, and labels it "both",
  "conversations only" or "survey only"; a codes × closed-question table (how respondents whose
  open answers carry a code answered, next to everyone); and a case view of participants across
  sources. Responses link to participants through personal invites (same email in the project).
- **Written analysis** (`/writeup`): a research brief (aim, research questions, hypotheses /
  propositions / assumptions, uploaded thesis or proposal: .docx/.txt/.md text is extracted, PDFs
  are passed to Claude as documents). "Write analysis" builds a context from the brief, codebook,
  quotes, themes, memos, survey summaries and the joint display, and the `AssistProvider` writes
  Markdown. The built-in writer is deterministic: findings per research question (codes matched by
  shared stems, ignoring words common to the whole codebook), convergence notes, a cautious
  verdict per statement, themes and limits. Claude writes in the UI language.
- **House style** (`src/lib/writeup/style.ts`) comes from the humanize checklist: no em/en dashes,
  no AI vocabulary, plain verbs, specific numbers, one honest hedge. It is part of Claude's prompt,
  and `cleanProse` runs on every draft and edit; tests assert the built-in draft has no tells.
- **Project groups**: Notion-style collapsible folders on the projects page; move a project from
  its folder button; deleting a group keeps its projects.
- **Activity**: category chips with 30-day counts, person, date range and text filters (URL state),
  day headings, section-colored icons, "show older" paging.
- **Notifications**: bell in the sidebar and phone header with unread count, polling once a minute.
  New responses (folded per study), transcript ready/failed, consent signed, member joined.
  `notify()` never throws, so a notification can't break the action behind it.
- **Brand**: the uploaded logotype and monogram (monogram rounded next to the wordmark and as the
  favicon). Notion-like neutrals (white page, warm gray chrome, thin borders, ink primary buttons,
  smaller radii) with the brand lavender as accent. Each area has its own hue (`--section-*`:
  forms, interviews, coding, mixed, write-up, people, activity) used in tab icons, page icon tiles
  and activity rows, and project tabs are grouped (Data · Qualitative · Mixed · Write-up · Find).
- **Persian**: full `fa` translation (RTL), set in Peyda (self-hosted woff2, `next/font/local`);
  Arabic also uses Peyda. Latin text inside Persian keeps Geist; quotes use `dir="auto"`.
- Fixed: the projects page always showed "No studies" (unqualified columns in the count subquery).

### Phase 7 notes

- **Generate / Upload / Enter manually** for every kind of input, through one component
  (`CreateOptions`, folded into `CreatePanel` where a page already has content):

  | What | Generate | Upload CSV (example file offered) | Enter manually |
  | --- | --- | --- | --- |
  | Questionnaire | from the brief + proposal (built-in rules or Claude) | `page,type,question,description,required,options,min,max,low_label,high_label` | templates + builder |
  | Interview guide | from the brief + proposal | `section,minutes,goal,question,probes,note` | guide builder |
  | Survey responses | fake test data (seeded, correlated scales) | one column per question, header = question text; template has the form's exact columns | the live form with `?entry=manual` (members only; stored as `manual`) |
  | Participants | fake people (example.com emails) | name/email/phone/id + attribute columns | add dialog |
  | Codebook | from the brief + clustered project text | `code,parent,definition,color` | codebook editor |
  | Transcript | sample built from the guide (mock transcriber) | .vtt / .srt / .txt import | field-notes editor, segment editing |

  CSV rows and AI output share one path (`QuestionRow[]` → `buildForm`). Every imported value is
  validated like a real submission and bad cells are reported, not guessed. Responses carry a
  `source`; generated test data gets a banner on Responses with one-click deletion.
- **Reports**: blocks (heading, Markdown text, survey chart with a note, quote, theme, joint display,
  write-up). Data blocks store references and are resolved on every view, so shared links stay
  current. "Generate report" assembles brief, key charts, joint display, themes with their best
  quotes and the latest write-up. Share by link (token; turning it off revokes it), print or save as
  PDF (print CSS shows only the report), or download Markdown.
- **Humanize**: the user's humanize skill is vendored at `docs/skills/humanize` (SKILL.md + the
  pattern and word references). `STYLE_RULES` restates its master principle, house rules and all
  33 patterns; `cleanProse` applies its safe swaps (filler, AI words, dashes); Claude drafts get the
  skill's audit step (list the remaining tells, then rewrite) as a second pass.
- Fixed: the responses table could push the page sideways (scroll container not positioned, grid
  without `grid-cols-1`).

### After Phase 7: proposal reading and the article-style writer

- **Upload the thesis or proposal and the brief fills itself in.** PDF text comes from a small
  built-in extractor (`src/lib/writeup/pdf.ts`: Flate and object streams, ToUnicode CMaps, text
  operators; scanned PDFs have no text). `extractBrief` finds the aim ("The aim of this study is…",
  an Aims section), research questions (RQ labels, a Research questions section, real questions)
  and hypotheses, propositions and assumptions (H1/P1 labels, a Hypotheses section, "we
  hypothesise / expect / assume that…"). Results merge into the brief without duplicates.
- **The built-in writer produces a "Data analysis and results" section** (`src/lib/writeup/article.ts`)
  with no AI service: an analysis paragraph, the sample (completion rate, demographics), a table of
  numeric and rating items, descriptive results in APA style, themes with quotes, a comparison of
  the two strands, a one-sample t-test against the scale midpoint for each hypothesis the survey
  measures (t, df, p, Cohen's d) combined with the qualitative evidence into a cautious verdict,
  an answer to each research question, and specific limitations. All numbers come from the
  project; the text goes through the humanize clean-up. Claude (`AI_PROVIDER=claude`) stays optional.

### Phase 8 notes

- **AI settings** (Settings → AI): owners pick a provider, paste its key (encrypted at rest, only
  the last four characters are ever shown again), pick the model, and can check the key (lists
  models, spends no tokens). The server's `ANTHROPIC_API_KEY` is a fallback.
- **Providers** (`src/lib/ai-providers.ts`, `src/server/ai/llm.ts`): Anthropic (SDK, structured
  output), Google Gemini (REST, JSON mode, reads PDFs), and OpenAI-compatible chat completions for
  Groq, OpenRouter, Mistral, OpenAI, Ollama and any custom endpoint. Providers without
  schema-constrained output get the JSON Schema in the prompt; the answer is validated with zod and
  retried once with the error. Migration `0008` adds `workspace_ai.base_url`.
- **Use AI / Placeholder** next to every generate button (questionnaire, guide, codebook, write-up,
  code suggestions, session summary, answer grouping, theme description). `providerFor()` resolves
  the choice on the server: "ai" needs a key (otherwise a clear "AI isn't set up" message);
  "placeholder" (the built-in offline generator) is allowed only for workspace owners and in
  development (`NODE_ENV !== production` or `LYZE_DEV_TOOLS=1`). Everyone else never sees it.
  Made-up data (test responses, test participants, sample transcripts) is likewise owner/dev-only.
- **Proposal reading** got stricter: stops at References/Appendix (so questionnaire items in an
  appendix aren't research questions), takes "Q1." only inside a research-questions section,
  keeps the first occurrence of a label (RQ1 restated in the Discussion), drops near-duplicates,
  prefers labelled questions, and only falls back to questions in the introduction. A new upload
  replaces the brief's questions and hypotheses instead of adding to them.
- **Public API** (read-only, Bearer key): projects with studies, and a study's cleaned responses as
  JSON (with variable metadata) or CSV. **Webhooks**: `response.submitted`, `transcript.ready`,
  `consent.signed`, POSTed as JSON with `X-Lyze-Event` and `X-Lyze-Signature: sha256=<HMAC>`; private
  and local addresses are refused in production; every delivery records its status.
- **Account**: download all your data as JSON; delete your account (type your email; workspaces
  where you're alone go with it; owning a shared workspace alone blocks it until you hand over).
- **Polish**: Lighthouse accessibility 100 on dashboard, coding, mixed methods, write-up, reports,
  activity, settings and sign-in (fixed: a link name that didn't match its visible text, low
  contrast on success text, labels on tinted cards); toasts no longer overflow small phones;
  settings pages share a tab bar.

### Coverage vs R, SPSS, NVivo, MAXQDA

| Tool | What Lyze does now | Later |
| --- | --- | --- |
| **SPSS** | Frequencies, descriptives, crosstabs + χ², t-tests, ANOVA, nonparametrics, correlations, reliability, recode / compute, select cases; SPSS syntax for each result; **.sav export** with variable labels, value labels, measurement levels, dates | Factor analysis, multiple/logistic regression, post-hoc tables |
| **R** | Same tests with R code for each result; **R bundle** (CSV + .sav + `lyze_import.R` that builds factors, ordered factors and labels) | Running R code inside Lyze is out of scope |
| **NVivo / ATLAS.ti / MAXQDA** | Coding, nested codebook, themes, memos, quote bank, search. **REFI-QDA .qdpx** project export with transcripts and open-text answers as sources, your codes and codings at the right positions, memos as notes and participants as cases with attributes (MAXQDA variant with CRLF line endings); **.qdc codebook import/export**. Per-study survey .qdpx from Phase 3 still works | — |
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
| 27 | Interview guide and consent form are **JSON documents** (like forms), not item tables | Autosave/undo in one object; guides are small; consent needs versioned snapshots anyway. |
| 28 | **Participants belong to a study**; `externalId`/email match people across studies | Matches the study-centred UI; mixed-methods studies already hold both survey and sessions. Cross-study linking is Phase 6. |
| 29 | Participants are **pseudonymous by default**: code everywhere in analysis, contact details only for editors, one-click anonymization that keeps attributes and data | GDPR-friendly without breaking analysis. |
| 30 | **One transcript per session**, speakers as a map on the transcript | Renaming or linking a speaker is one edit; segments stay stable for coding in Phase 5. |
| 31 | Field notes and diary entries are stored as **manual transcripts** (one segment per paragraph) | Every kind of qualitative text is coded, searched and exported the same way in Phase 5. Rewriting an entry replaces its segments. |
| 32 | Recordings upload through the app (streamed with a size cap, `MEDIA_MAX_MB`), not presigned S3 URLs | One code path for local disk and S3, permission checks in one place. Direct-to-S3 multipart uploads are a later scale-up. |
| 33 | Mock transcription is the default; real speech-to-text is opt-in via env | Every screen works offline and in tests; no audio leaves the server unless configured. |
| 34 | **Codes are project-scoped**, not study-scoped | One codebook across interviews, field notes and survey answers is how qualitative teams work; the same code can be compared across methods in Phase 6. |
| 35 | Codings store **UTF-16 offsets into one unit** (a segment or an answer), converted to code points only on REFI-QDA export | Matches the DOM, so highlights are exact; selections that span units become one coding per unit. |
| 36 | Theme membership is a column on `codes` (`themeId`, `themePosition`), not a join table | A code belongs to at most one theme on the board; moving a card is a single update. |
| 37 | AI help sits behind an `AssistProvider`; built-in heuristics are the default, Claude is opt-in (`AI_PROVIDER=claude`) | Works offline and in tests; no research data leaves the server unless the workspace operator configures it. |
| 38 | AI suggestions are **pending codings** (`source = ai`, `approvedAt = null`) | They are visible in context, but excluded from counts, quotes, search filters and exports until a person accepts them. |
| 39 | Mixed-methods views are **computed on read** from codings and answers, not stored | Always in sync with coding; the data sizes involved are small. |
| 40 | Written analyses are **saved drafts** (Markdown), regenerated on demand, never edited in place by the AI | People edit the text freely; each run is a new draft, so nothing a person wrote is overwritten. |
| 41 | The built-in writer stays English; Claude writes in the UI language | Template prose in several languages would read stiffly; a model writes natural Persian. |
| 42 | Notifications are in-app only (no email yet) and fold repeats by `groupKey` | One "48 new responses" instead of 48 rows; email digests can come later. |
| 43 | Brand primary is ink, not lavender | Matches the logotype; lavender (#A49EFF) stays the accent so status and data colors keep their meaning. |
| 44 | Every input has **Generate / Upload CSV / Enter manually**, and uploads always offer an example file | Researchers start from a proposal, a spreadsheet or a blank page; none of the three should be a dead end. |
| 45 | Generated responses are real rows with `source = generated`, not a separate sandbox | The whole analysis pipeline (results, tests, exports) can be tried end to end; a banner and one-click delete keep it honest. |
| 46 | Manual entry reuses the respondent form (`?entry=manual`, signed-in members only) | Same validation and logic as real respondents; no second data-entry UI to maintain. |
| 47 | Report blocks reference data instead of copying it | Reports and their public links stay current as coding and data change; deleted items show a clear placeholder. |
| 48 | PDF via the browser's print (print stylesheet), not a server renderer | No headless browser in production; charts print as vector SVG. A server-side PDF/DOCX export can come later. |
| 49 | AI keys are stored per workspace, encrypted with a key derived from AUTH_SECRET | Each team pays for its own usage; a database leak alone doesn't expose keys. Rotating AUTH_SECRET makes stored keys unreadable (owners re-enter them). |
| 50 | Placeholder generation is owner/dev-only | It's a testing tool; real users should get real AI or a clear message, never canned text they might mistake for analysis. |
| 51 | The public API is read-only in v1 | Covers the common needs (R/Python scripts, dashboards) without opening write paths; writes can come later with scoped keys. |
| 52 | Several AI providers behind one small `Llm` interface (JSON + write), not one SDK per feature | Researchers without a budget can use free tiers (Gemini, Groq, OpenRouter, Ollama); most providers speak the OpenAI protocol, so one client covers them. |
