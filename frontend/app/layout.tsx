import "./globals.css";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata = {
  title: "Pricing the Heat",
  description:
    "High-frequency income smoothing for informal outdoor workers facing heatwave wage loss",
};

const NAV_LINKS = [
  { href: "/", label: "Heat map" },
  { href: "/simulate", label: "Simulate a policy" },
  { href: "/assistant", label: "Ask the assistant" },
  { href: "/methodology", label: "Methodology" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-gray-50 text-gray-900 font-sans antialiased">
        <header className="border-b border-gray-200 bg-white">
          <nav className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold text-gray-900 mr-4">
              Pricing the Heat
            </Link>
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm text-gray-600 hover:text-gray-900">
                {l.label}
              </Link>
            ))}
            <span className="ml-auto text-xs text-gray-400 uppercase tracking-wide">
              Income smoothing, not disaster insurance
            </span>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
