import Link from "next/link";
import { Logo } from "@/components/common/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_60%)]">
      <header className="px-4 py-5 sm:px-8">
        <Link href="/" className="inline-flex rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
          <Logo />
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        {children}
      </main>
    </div>
  );
}
