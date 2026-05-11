"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-border bg-background/60">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{t("footer.title")}</span>
          <span className="hidden sm:inline">·</span>
          <span>{t("footer.subtitle")}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link className="hover:text-foreground" href="/search">
            {t("footer.search")}
          </Link>
        </div>
      </div>
    </footer>
  );
}