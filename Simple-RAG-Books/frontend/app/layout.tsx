import type { Metadata } from "next";
import { Inter, Literata } from "next/font/google";
import "./globals.css";

import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
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
  title: "E-Kutubxona",
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
              <Footer />
            </div>
          </LanguageProvider>
        </Providers>
      </body>
    </html>
  );
}