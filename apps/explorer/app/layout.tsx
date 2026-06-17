import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { cohortLabel } from "@/lib/rulebook";
import { StudentSessionProvider } from "./providers/StudentSession";

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

export const metadata: Metadata = {
  title: "NTU EEE Co-Pilot — Explorer",
  description:
    "Research NTU Electrical & Electronic Engineering specializations, grading, and careers — anchored to a verified, version-tracked rulebook.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${sans.variable}`}>
      <body suppressHydrationWarning>
        <StudentSessionProvider>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
              <span className="text-ember">▎</span> EEE·CO-PILOT
            </Link>
            <nav className="flex gap-5 font-mono text-xs text-ash">
              <Link href="/" className="hover:text-bone">specializations</Link>
              <Link href="/admissions" className="hover:text-bone">admissions</Link>
              <Link href="/optimizer" className="text-ember hover:text-bone">optimizer</Link>
              <Link href="/suggest" className="hover:text-bone">suggest&nbsp;a&nbsp;fix</Link>
            </nav>
          </div>
          <div className="seam" />
        </header>

        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>

        <footer className="mt-16 border-t border-line">
          <div className="mx-auto max-w-5xl px-6 py-6 font-mono text-[11px] leading-relaxed text-ash">
            <p>{cohortLabel()} · rulebook is version-tracked, not official. Always confirm with the NTU Office of Academic Services.</p>
            <p className="mt-1">Data is reconstructed from public NTU sources; confidence badges show how verified each field is.</p>
          </div>
        </footer>
        </StudentSessionProvider>
      </body>
    </html>
  );
}
