# Lyze

Lyze is a calm, minimal web app for collecting and analyzing research data —
surveys and forms, interviews, and quantitative, qualitative and mixed-methods
analysis in one place. The name is "analyze", trimmed to its essentials.

> **Status:** Phases 1–4 of 8 are complete (foundation; form builder, respondent forms and
> response storage; results, charts, statistics and exports for SPSS, R, NVivo, ATLAS.ti and
> MAXQDA; interviews with guides, participants, consent, recording and transcription). See [PLAN.md](./PLAN.md) for the architecture, data model, route map and what's next.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

That's it — no database or email server needed for local development:

- The app uses an **embedded Postgres (PGlite)** stored in `./.data/pglite`, and
  applies migrations automatically on startup.
- Sign-in links are printed to the server console and collected at
  **[/dev/mailbox](http://localhost:3000/dev/mailbox)**.

Sign in with any email address, name your workspace, and tick “Add a demo
project” — it includes a published survey you can open, share and answer right away.

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you need.

| Variable | Required | Description |
| --- | --- | --- |
| `AUTH_SECRET` | prod | Auth.js secret (`npx auth secret`). A dev-only fallback is used locally. |
| `APP_URL` | prod | Public base URL used in emails and share links. |
| `DATABASE_URL` | prod | Postgres connection string. Empty → embedded PGlite. |
| `PGLITE_DIR` | no | PGlite data directory (default `./.data/pglite`, `memory://` for in-memory). |
| `DB_AUTO_MIGRATE` | no | `1` to apply migrations on boot when using `DATABASE_URL`. |
| `EMAIL_SERVER` | prod | SMTP URL for magic links, e.g. `smtp://user:pass@host:587`. |
| `EMAIL_FROM` | no | Sender, e.g. `Lyze <hello@example.com>`. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | no | Enables “Continue with Google”. |
| `AUTH_TRUST_HOST` | no | Set to `false` to stop trusting `X-Forwarded-Host`. |
| `LYZE_DEV_MAILBOX` | no | `1` exposes `/dev/mailbox` outside development (used by e2e). Never enable in real production. |
| `UPLOADS_DIR` | no | Local folder for uploaded files when S3 isn't configured (default `./.data/uploads`). |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | prod | Any S3-compatible storage for uploads and recordings. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | no | Enables the optional captcha on public forms. |
| `MEDIA_MAX_MB` | no | Largest session recording accepted (default 500 MB). |
| `TRANSCRIPTION_PROVIDER` | no | Empty → mock transcripts (dev). `openai` → any OpenAI-compatible speech-to-text endpoint. |
| `TRANSCRIPTION_API_KEY`, `TRANSCRIPTION_API_URL`, `TRANSCRIPTION_MODEL` | with `openai` | Key, base URL (default `https://api.openai.com/v1`) and model (default `whisper-1`). |
| `ANTHROPIC_API_KEY` | no | Server-wide fallback Anthropic key. Usually each workspace picks a provider and adds its own key in Settings → AI instead. |
| `AI_MODEL` | no | Model for the server-wide key (default `claude-opus-5-5`). |
| `AI_PROVIDER` | no | `claude` makes scripts and background jobs without an explicit choice use the server key. |
| `LYZE_DEV_TOOLS` | no | `1` lets every member use Placeholder generation and test data in production (normally owners only). |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack). |
| `npm run build` / `npm start` | Production build / serve. |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules). |
| `npm run typecheck` | `tsc --noEmit` (strict). |
| `npm test` | Vitest unit + service tests (in-memory Postgres). |
| `npm run test:e2e` | Playwright on a 360px phone and a 1280px desktop (builds and starts the app with an in-memory DB). |
| `npm run check` | Lint + typecheck + unit tests. |
| `npm run db:generate` | Generate a SQL migration from `src/server/db/schema.ts`. |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (or the local PGlite DB). |
| `npm run db:studio` | Drizzle Studio (needs `DATABASE_URL`). |

## Analysis and exports

- **Results** — a summary and chart for every question (bars, diverging Likert, box plots, NPS,
  word frequencies, responses over time), each with a table view. Filter by any answer and
  compare by any choice question; filters live in the URL.
- **Analyze** — crosstab (χ², Cramér's V, Fisher), compare groups (t-test / ANOVA, or
  Mann–Whitney / Kruskal–Wallis when the data call for it), correlation with scatter plot,
  before/after (paired t), reliability (Cronbach's α) and a correlation matrix. Each result
  explains itself in plain language, gives an APA line, checks assumptions and shows the
  **R and SPSS syntax** that reproduces it.
- **Prepare data** — which responses count (unfinished, screened out, speeders, manual
  exclusions), recodes (group, reverse, ranges) and scale scores. Rules apply to Results,
  Analyze and every export; original answers never change.
- **Export** (Results or Analyze → Export):

| Format | Opens in |
| --- | --- |
| Excel `.xlsx` | Excel, Sheets, Numbers (responses, codes, variable list) |
| CSV (labels or codes) | Anything |
| SPSS `.sav` | SPSS, PSPP, jamovi, JASP, R `haven`, Python `pyreadstat` |
| R bundle `.zip` | R / RStudio — `source("lyze_import.R")` gives a labelled `lyze` data frame |
| REFI-QDA `.qdpx` | NVivo, ATLAS.ti, MAXQDA (separate MAXQDA variant), QualCoder |

## Interviews

- **Guide** — topics with goals and time budgets, questions, probes and private notes; templates
  for discovery interviews, usability tests and focus groups. Autosaves with undo.
- **Consent form** — versioned; participants sign online from a personal link (emailed or
  copied), or you record verbal/written consent. Every signature records version, method and time.
- **Participants** — codes (P01…), a recruiting pipeline (recruited → eligible → scheduled →
  completed), attributes for analysis, CSV import, and anonymization that keeps the data usable.
- **Sessions** — interviews, focus groups, field notes and diary entries; schedule them and add
  them to a calendar (.ics).
- **Live view** — timer, in-browser recording, the guide as a checklist with time budgets, and
  timestamped notes with quick tags (Alt+1–5).
- **Transcripts** — upload audio/video for automatic transcription (mock provider in dev, any
  OpenAI-compatible speech-to-text in production) or import a Zoom/Teams/Otter transcript
  (.vtt, .srt, .txt). The transcript follows playback, timestamps seek the player (k / j / l
  shortcuts), segments and speakers can be corrected, and transcripts download as .txt, .vtt or .srt.

## Qualitative analysis

Every project has tabs for **Coding, Codebook, Themes, Quotes, Memos and Search**. Codes belong to
the project, so one codebook covers its interviews, field notes, diaries and open-text survey
answers.

- **Coding** — pick a transcript or an open-text question, select text and apply a code (or type
  a new name to create one). Highlights show every code on a passage; click one to star it,
  remove it or add a memo. On phones each passage has a **Code** button.
- **Codebook** — nested codes (up to four levels) with colors and definitions; reorder, merge,
  and split selected passages into a new code. Import or export a REFI-QDA codebook (.qdc).
- **Themes** — a board: drag codes into themes (keyboard: Space to pick up, arrows, Space to drop).
- **Quotes** — every coded passage, filterable by code, theme, study and participant; star, copy
  with its source, or download as CSV.
- **Memos** — on the project, a code, a theme, a passage or a session; all collected in one list.
- **Search** — across transcripts, answers and memos, with `"phrases"` and `-exclusions`, and
  filters for study, participant, code and date.
- **Assistant** — suggest codes for a document, summarize a session, group open-text answers into
  candidate codes, and draft a theme description. Everything it produces is labelled as a
  suggestion: suggested codings wait in a review list and count nowhere until you accept them.
  The default assistant runs locally with simple text heuristics; set `AI_PROVIDER=claude` and
  `ANTHROPIC_API_KEY` to use Claude instead (the text being coded is then sent to Anthropic).
- **Results** for open-text questions show top words as bars or a word cloud, plus a tone split
  (positive / neutral / negative, English only) with example answers.
- **Exchange** — export the whole project as REFI-QDA .qdpx (sources, codes, codings, memos,
  participants as cases) for NVivo, ATLAS.ti, MAXQDA (CRLF variant) or QualCoder.

## Mixed methods and the write-up

- **Mixed methods** — a joint display of each code in conversations and in survey answers
  (both / conversations only / survey only), a table of how people who raised a code answered a
  closed question, and a view of participants across sources.
- **Brief** — the project's aim, research questions and hypotheses, plus the thesis or proposal
  (.docx, .txt, .md; PDFs are read by Claude).
- **Write analysis** — a written draft organized by research question, with an assessment of each
  hypothesis, built from your codes, quotes and survey results. It follows a plain "human" house
  style (no em dashes, no AI filler, every claim tied to a number or a quote). Edit, copy or
  download it as Markdown.

## Workspace

- **Project groups** — custom folders on the projects page.
- **Activity** — filter by type, person, date and text; grouped by day.
- **Notifications** — new responses, finished transcripts, signed consent and new members, from
  the bell in the sidebar (or the header on phones).
- **Languages** — English, Persian (فارسی, set in Peyda) and Arabic; switch from the account menu.

## Generate, upload or enter by hand

Everything you put into Lyze can come in three ways: **generate** it (from your research brief and
proposal, or as test data), **upload a CSV** (each upload offers an example file to start from),
or **enter it manually**. This covers questionnaires, interview guides, survey responses (generated
test responses are labelled and removable in one click; manual entry opens the form for typing in
paper questionnaires), participants, codebooks and transcripts.

## Reports

Combine headings, text, survey charts, quotes, themes, the joint display and your write-up into a
report, or press **Generate report** for a first draft. Share it with a read-only link (it always
shows current data; turn the link off to revoke it), print or save it as PDF, or download Markdown.

All prose Lyze writes follows the humanize skill in `docs/skills/humanize`.

## AI

Owners pick a provider in **Settings → AI**, paste its key (stored encrypted; only its last four
characters are shown) and pick a model. Supported providers:

| Provider | Free option | Where to get a key |
| --- | --- | --- |
| Google Gemini | yes, rate-limited free tier | <https://aistudio.google.com/apikey> |
| Groq | yes, rate-limited free tier | <https://console.groq.com/keys> |
| OpenRouter | yes, models ending in `:free` | <https://openrouter.ai/settings/keys> |
| Mistral | yes, free "Experiment" plan | <https://console.mistral.ai/api-keys> |
| Ollama | free, runs on your own computer, no key | <https://ollama.com/download> |
| Anthropic Claude | paid | <https://console.anthropic.com/settings/keys> |
| OpenAI | paid | <https://platform.openai.com/api-keys> |
| Other | any OpenAI-compatible endpoint (LM Studio, vLLM, Together…) | — |

Claude and Gemini read uploaded proposal PDFs directly; the others get the extracted text. Free
tiers have rate limits and some use your prompts to improve their models, so check the provider's
terms before sending real participant data. Model names change often: the model field is free text
with suggestions. Every generate button then has a **Use AI / Placeholder**
choice: Placeholder is Lyze's built-in offline generator, shown only to workspace owners and in
development, for testing without spending tokens.

## API and webhooks

Create a key in **Settings → API & webhooks**, then:

```sh
curl -H "Authorization: Bearer lyze_…" https://your-lyze/api/v1/projects
curl -H "Authorization: Bearer lyze_…" "https://your-lyze/api/v1/studies/<studyId>/responses?format=csv"
```

Webhooks receive `response.submitted`, `transcript.ready` and `consent.signed` as JSON. Verify the
`X-Lyze-Signature` header: it is `sha256=` followed by the HMAC-SHA256 of the raw body with the
webhook's signing secret.

## Your data

**Account → Your data** downloads everything Lyze holds about you as JSON, or deletes your account.

## Architecture

```
src/
  app/                 Next.js App Router routes (thin: load data, render components)
    (auth)/sign-in     Magic link + Google sign-in
    onboarding/        First workspace (+ optional demo project)
    w/[ws]/…           Authenticated app shell: dashboard, projects, studies, activity, settings
    invite/[token]     Accept a workspace invite
    dev/mailbox        Dev-only inbox for sign-in links
  app/(respondent)/f/  Public forms — separate, minimal root layout
  app/api/f/…          Respondent API: start, save, submit, upload (rate-limited)
  components/
    ui/                shadcn/ui primitives (Radix), vendored
    shell/             Sidebar, mobile tab bar, command palette (⌘/Ctrl+K)
    builder/           Form builder: dnd canvas, settings panel, logic, translations, preview
    form-runner/       Respondent form (native inputs, tiny bundle; also powers preview)
    …                  Feature components composed from primitives
  server/
    actions/           Server Actions: validate → authorize → mutate → audit → revalidate
    services/          Business logic, role checks, audit logging (unit tested)
    queries/           Request-scoped loaders for routes
    db/                Drizzle schema, lazy client (Postgres | PGlite), migrations
    auth.ts            Auth.js v5 config (database sessions)
    mail/              Mailer (SMTP or dev mailbox) + email templates
  lib/                 Framework-free logic: permissions, validation (Zod), slugs, ids
  lib/stats/           Statistics library (distributions, descriptives, tests), tested vs SciPy
  lib/analysis/        Dataset builder (SPSS-style variables), recodes, summaries, R/SPSS syntax
  lib/exports/         .sav, .xlsx, CSV, R script and REFI-QDA .qdpx writers
  lib/interviews/      Guide docs, participants, transcript import/export, timestamps, .ics, mock transcriber
  server/transcription/  Speech-to-text providers (mock | OpenAI-compatible)
  lib/forms/           Form document schema, answer validation, logic engine, piping,
                       quotas, translations, templates (heavily unit tested)
  server/storage/      Storage adapters: local disk (dev) and S3-compatible
  i18n/                next-intl config (locale from cookie / Accept-Language, RTL aware)
messages/              Translations (en, ar)
drizzle/               SQL migrations
tests/                 unit/ (Vitest) and e2e/ (Playwright)
```

Key decisions are logged in [PLAN.md → Decisions log](./PLAN.md#decisions-log).

### Roles

| | Owner | Editor | Analyst | Viewer |
| --- | :-: | :-: | :-: | :-: |
| View projects, studies, results | ✓ | ✓ | ✓ | ✓ |
| Code, theme, memo, report | ✓ | ✓ | ✓ | |
| Create/edit projects, studies, forms | ✓ | ✓ | | |
| Activity log | ✓ | ✓ | | |
| Members, workspace settings, delete | ✓ | | | |

### Design system

All colors, radii, shadows and motion are CSS variables in
`src/app/globals.css` (light + dark), mapped into Tailwind v4. One accent
(soft violet), warm neutrals, `rounded-xl`/`2xl` corners, 150–200ms motion that
switches off under `prefers-reduced-motion`. Layout uses logical properties
(`ps-*`, `ms-*`, `start-*`) so right-to-left languages work; try Arabic from the
account menu.

Keyboard: **⌘/Ctrl+K** command palette · **⌘/Ctrl+B** toggle sidebar ·
**⌘/Ctrl+Shift+L** toggle theme.

## Screenshot checklist

Check each at **360px**, **768px** and **1280px+**, in light and dark mode:

- [ ] Landing page and sign-in
- [ ] Check-your-email and dev mailbox
- [ ] Onboarding (first workspace, demo project option)
- [ ] Dashboard — empty and with studies
- [ ] Projects — grid, empty, archived
- [ ] Project detail — studies list and empty state; new study dialog (bottom sheet on phones)
- [ ] Study detail — details form and next steps
- [ ] Activity log
- [ ] Settings and members (invite dialog, pending invites, role select)
- [ ] Mobile “More” sheet and bottom tab bar
- [ ] Command palette (desktop)
- [ ] Arabic (RTL) dashboard
- [ ] Form builder: template picker, canvas with a selected question, settings panel, logic dialog
- [ ] Builder preview: phone and desktop frames
- [ ] Builder on a phone: full-height editing sheet
- [ ] Public form on a phone: each question type, validation message, progress bar, thank-you
- [ ] Resume prompt (“Welcome back”) and “Save and finish later” link
- [ ] Share page: link, QR, embed, invites
- [ ] Responses list (cards on phones, table on desktop) and response detail
- [ ] Responses grid: sort, search, column picker; excluded response badge
- [ ] Results: KPIs, over-time chart, each question type, table toggle, filter dialog, compare-by
- [ ] Analyze: crosstab heatmap, compare groups (box plots), correlation (scatter + line), reliability
- [ ] Prepare data: toggles, recode editors, scale score, sticky save bar
- [ ] Export menu
- [ ] Study overview for interview studies (sessions card, next steps)
- [ ] Guide builder: template picker, topics with timing, probes, drag to reorder; consent form tab
- [ ] Participants: table (desktop) / cards (phone), status filter, import dialog, participant page with consent panel
- [ ] Sessions list (up next / done) and new-session dialog
- [ ] Session page: player + following transcript + inline notes, speakers dialog, editing a segment, field-notes editor
- [ ] Live session: timer, recording meter, guide checklist, quick notes (desktop and phone tabs)
- [ ] Public consent page on a phone: unsigned, validation message, signed
- [ ] Coding: document list / picker, highlights with code chips, code picker popover, passage menu, suggestions review, codes panel (bottom sheet on phones)
- [ ] Codebook: tree, code detail with passages and split, merge dialog, import dialog
- [ ] Themes board: columns, drag a card, theme dialog with drafted description
- [ ] Quotes: filters, cards, starred; Memos list; Search with filters and highlighted hits
- [ ] Results for an open-text question: bars, word cloud, tone bar
- [ ] Mixed methods: joint display, codes × answers, people
- [ ] Write-up: brief editor (mobile), a generated draft, edit mode
- [ ] Projects page with groups; notifications menu; activity filters
- [ ] Persian (RTL, Peyda) on dashboard, project tabs and a respondent form
- [ ] Generate / Upload / Manual on build page, guide, responses (with test-data banner), participants, codebook, session
- [ ] Reports: list, generated report in the editor, public link page, print preview
- [ ] Settings tabs; AI page (no key / workspace key); Use AI / Placeholder dropdown next to Write analysis
- [ ] API & webhooks page with a new key shown once; account "Your data" card and delete dialog
