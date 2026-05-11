import type { Metadata } from "next";
import { Inter, Literata } from "next/font/google";
import "./globals.css";

import { SiteHeader } from "@/components/site-header";
import { Providers } from "@/components/providers";
import { LanguageProvider } from "@/components/language-provider";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fontSerif = Literata({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Simple RAG Books",
  description: "Search and explore your book collection",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz">
      <body
        className={`${fontSans.variable} ${fontSerif.variable} min-h-dvh bg-background font-sans text-foreground antialiased`}
      >
        <Providers>
          <LanguageProvider>
            <div className="relative flex min-h-dvh flex-col">
              <SiteHeader />
              <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
                {children}
              </main>
            <footer className="border-t border-border bg-background/60">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Simple RAG Books</span>
                  <span className="hidden sm:inline">·</span>
                  <span>Search and explore your library</span>
                </div>
                <div className="flex items-center gap-4">
                  <a className="hover:text-foreground" href="/search">
                    Search
                  </a>
                </div>
              </div>
            </footer>
            </div>
          </LanguageProvider>
        </Providers>
      </body>
    </html>
  );
}