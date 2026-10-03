import { Mascot } from "@/components/illustrations";

export default function FormNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <Mascot mood="sleepy" />
      <h1 className="text-2xl font-semibold">Form not found</h1>
      <p className="max-w-md text-muted-foreground">This link may be mistyped, or the form isn&apos;t published yet.</p>
    </main>
  );
}
