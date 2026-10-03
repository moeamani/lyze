import type { SetupProblem } from "@/server/setup";

/** What a fresh deployment still needs. Plain English: it's for whoever runs the server. */
export function SetupNeeded({ problems }: { problems: SetupProblem[] }) {
  return (
    <main id="main" className="mx-auto grid min-h-dvh w-full max-w-xl content-center gap-6 px-4 py-12">
      <div className="grid gap-2">
        <p className="text-sm font-medium text-muted-foreground">Lyze</p>
        <h1 className="text-2xl font-semibold text-balance">This deployment needs a little setup</h1>
        <p className="text-pretty text-muted-foreground">
          Add the settings below in your hosting dashboard (on Vercel: Project → Settings → Environment Variables, or Storage), then redeploy.
        </p>
      </div>
      <ol className="grid gap-3">
        {problems.map((p, i) => (
          <li key={p.key} className="grid gap-1 rounded-xl border bg-card p-4">
            <p className="font-medium">
              {i + 1}. {p.title}
            </p>
            <p className="text-sm text-pretty text-muted-foreground">{p.fix}</p>
          </li>
        ))}
      </ol>
      <p className="text-xs text-pretty text-muted-foreground">
        Recommended too: <code>LYZE_AI_KEY</code> (a Google Gemini key, so AI works without a key per workspace) and a Blob store (Storage → Blob) so uploaded files are kept.
      </p>
    </main>
  );
}
