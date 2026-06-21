import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/layout/TopNav";

export const metadata: Metadata = {
  title: "QuantCode",
  description: "Read-only research dashboard for the QuantCode quant-research pipeline",
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
