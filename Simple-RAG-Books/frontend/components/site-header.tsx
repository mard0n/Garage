"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Library, LogIn, Bookmark, Globe } from "lucide-react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { locales, localeNames, localeFlags } from "@/i18n/config";

export function SiteHeader() {
  const { t, i18n } = useTranslation();
  const pathname = usePathname();
  const { isSignedIn } = useUser();
  const [isLangOpen, setIsLangOpen] = React.useState(false);
  const [currentLocale, setCurrentLocale] = React.useState(() => {
    if (typeof window !== "undefined") {
      const match = document.cookie.match(new RegExp("(^| )locale=([^;]+)"));
      return match ? match[2] : "uz";
    }
    return "uz";
  });

  const handleLocaleChange = (locale: string) => {
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `locale=${locale};path=/;max-age=31536000`;
    setCurrentLocale(locale);
    i18n.changeLanguage(locale);
    setIsLangOpen(false);
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
          </span>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-semibold tracking-tight">{t("header.logoTitle")}</div>
            <div className="text-xs text-muted-foreground">{t("header.logoSubtitle")}</div>
          </div>
        </Link>

        <div className="flex-1" />

        <nav className="flex items-center gap-1">
          <Button asChild variant={pathname === "/" ? "secondary" : "ghost"} size="sm">
            <Link href="/" className="gap-2">
              <Library className="size-4" aria-hidden="true" />
              <span>{t("header.browse")}</span>
            </Link>
          </Button>
          {isSignedIn && (
            <Button asChild variant={pathname === "/saved" ? "secondary" : "ghost"} size="sm">
              <Link href="/saved" className="gap-2">
                <Bookmark className="size-4" aria-hidden="true" />
                <span>{t("header.saved")}</span>
              </Link>
            </Button>
          )}
        </nav>

        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsLangOpen(!isLangOpen)}
            className="gap-2"
          >
            <Globe className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{localeFlags[currentLocale]}</span>
          </Button>
          {isLangOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-md">
              {locales.map((locale) => (
                <button
                  key={locale}
                  onClick={() => handleLocaleChange(locale)}
                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${
                    currentLocale === locale ? "bg-accent" : ""
                  }`}
                >
                  <span>{localeFlags[locale]}</span>
                  <span>{localeNames[locale]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {isSignedIn ? (
          <UserButton />
        ) : (
          <SignInButton mode="modal">
            <Button type="button" variant="outline" size="sm" className="gap-2">
              <LogIn className="size-4" aria-hidden="true" />
              <span>{t("header.signIn")}</span>
            </Button>
          </SignInButton>
        )}
      </div>
    </header>
  );
}