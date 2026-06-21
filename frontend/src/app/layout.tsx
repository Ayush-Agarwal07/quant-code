import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { TopNav } from "@/components/layout/TopNav";

export const metadata: Metadata = {
  title: "QuantForge",
  description: "Read-only strategy research workspace for the QuantForge research pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex h-screen flex-col overflow-hidden font-sans antialiased">
        <TopNav />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
