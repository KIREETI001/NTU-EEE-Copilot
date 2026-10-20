import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { cohortLabel } from "@/lib/rulebook";
import { StudentSessionProvider } from "./providers/StudentSession";
import { RoleProvider } from "./providers/Role";
import { RoleSwitch } from "./components/RoleSwitch";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});
const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "NTU EEE Co-Pilot",
  description:
    "Research NTU Electrical & Electronic Engineering specializations, grading and careers, anchored to a verified, version-tracked rulebook.",
};

const NAV = [
  { href: "/", label: "Specializations" },
  { href: "/admissions", label: "Admissions" },
  { href: "/optimizer", label: "CGPA & FGO planner" },
  { href: "/eligibility", label: "My eligibility" },
  { href: "/suggest", label: "Report an error" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body suppressHydrationWarning>
        <RoleProvider>
        <StudentSessionProvider>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-6 lg:flex-nowrap">
            <Link href="/" className="shrink-0 whitespace-nowrap font-serif text-[20px] font-semibold text-bone">
              EEE Co-Pilot
            </Link>
            <RoleSwitch />
            <nav aria-label="Main" className="-mx-1 flex w-full min-w-0 gap-0.5 overflow-x-auto text-[15px] lg:mx-0 lg:w-auto">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-ash hover:bg-surface2 hover:text-bone">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-14">{children}</main>

        <footer className="mt-16 border-t border-line">
          <div className="mx-auto max-w-5xl px-5 py-8 text-[14px] leading-relaxed text-ash sm:px-6">
            <p>
              {cohortLabel()}. This rulebook is version-tracked but not official. Always confirm with the NTU Office of Academic Services.
            </p>
            <p className="mt-1">
              Data is reconstructed from public NTU sources. The confidence label on each item shows how well it has been verified.
            </p>
          </div>
        </footer>
        </StudentSessionProvider>
        </RoleProvider>
      </body>
    </html>
  );
}
