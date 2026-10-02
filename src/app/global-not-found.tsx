import type { Metadata } from "next";
import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = { title: "Page not found · Lyze" };

// Unmatched URLs skip the normal layouts entirely, so this page is self-contained.
export default function GlobalNotFound() {
  return (
    <html lang="en" className={GeistSans.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')`,
          }}
        />
      </head>
      <body className="font-sans">
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-6xl font-semibold text-primary">404</p>
          <h1 className="text-2xl font-semibold">Nothing to see here</h1>
          <p className="max-w-sm text-muted-foreground">The page you&apos;re looking for moved, was deleted, or never existed.</p>
          <Link href="/" className="rounded-xl border bg-card px-4 py-2.5 text-sm font-medium shadow-soft hover:bg-accent">
            Go home
          </Link>
        </main>
      </body>
    </html>
  );
}
