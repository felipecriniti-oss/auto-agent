import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoAgent Negotiation Playground",
  description: "Chat manual funcional — Fase 1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
