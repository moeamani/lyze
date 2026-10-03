# Lyze

Lyze is a calm, minimal web app for collecting and analyzing research data —
surveys and forms, interviews, and quantitative, qualitative and mixed-methods
analysis in one place. The name is "analyze", trimmed to its essentials.

> **Status:** Phases 1–3 are complete (foundation; form builder, respondent forms and response
> storage; results, charts, statistics and exports for SPSS, R, NVivo, ATLAS.ti and MAXQDA). See [PLAN.md](./PLAN.md) for the architecture, data model, route map and what's next.

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
