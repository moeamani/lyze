import type { Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "../globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#16161a" },
  ],
};

/**
 * Root layout for respondent pages. Deliberately bare: no app providers, no app translations,
 * just the stylesheet, one font and a 1-line script that follows the system color scheme.
 */
export default function RespondentLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={GeistSans.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
