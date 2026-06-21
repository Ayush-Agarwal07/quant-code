import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/layout/TopNav";

// Sans for prose (readable), mono for data/labels/chrome (the terminal feel). Exposed as CSS
// vars so Tailwind `font-sans` / `font-mono` map to them.
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "QuantCode",
  description: "Read-only research dashboard for the QuantCode quant-research pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
      <body className="flex h-screen flex-col overflow-hidden font-sans antialiased">
        <TopNav />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
