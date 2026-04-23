import { ReactQueryProvider } from "@/components/providers/ReactQueryProvider";
import { ThemeProvider } from "@/components/theme-provider";
import type { Metadata } from "next";
import { Fraunces, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoAgente — painel do lojista",
  description: "Marketplace B2B de seminovos — 20 a 30% abaixo da FIPE. Piloto SP.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${geist.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen bg-background font-sans text-foreground antialiased"
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ReactQueryProvider>{children}</ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
