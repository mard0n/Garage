"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSavedBooks } from "@/hooks/use-saved-books";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useTranslation } from "react-i18next";

export default function SavedPage() {
  const { t } = useTranslation();
  const { savedBooks, isSignedIn, isLoaded } = useSavedBooks();
  const { isLoaded: userLoaded } = useUser();

  const categories = useMemo(() => {
    if (savedBooks.length === 0) return [];

    const grouped = savedBooks.reduce<Record<string, typeof savedBooks>>((acc, book) => {
      const category = book.category || "Uncategorized";
      acc[category] = [...(acc[category] || []), book];
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([name, books]) => ({
        name,
        books: books.sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [savedBooks]);

  if (!isLoaded || !userLoaded) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t("saved.title")}</h1>
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">{t("saved.loading")}</div>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t("saved.title")}</h1>
        <Card className="bg-muted/50">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <BookOpen className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground">{t("saved.signInPrompt")}</p>
            <SignInButton mode="modal">
              <Button>{t("saved.signIn")}</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (savedBooks.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t("saved.title")}</h1>
        <Card className="bg-muted/50">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <BookOpen className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground">
              {t("saved.emptyPrompt")}
            </p>
            <Button asChild>
              <Link href="/">{t("saved.browseBooks")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("saved.title")}</h1>
        <p className="text-muted-foreground">
          {savedBooks.length} {t("saved.savedCount")}
        </p>
      </div>

      <div className="space-y-8">
        {categories.map((category) => (
          <div key={category.name} className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold tracking-tight">{category.name}</h3>
              <span className="shrink-0 text-sm text-muted-foreground">
                {category.books.length} book{category.books.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <div className="flex w-max gap-4">
                {category.books.map((book) => (
                  <Link
                    key={book.filename}
                    href={`/book/${encodeURIComponent(book.filename)}`}
                    className="group w-36 shrink-0 sm:w-40"
                  >
                    <div className="overflow-hidden rounded-lg border border-border bg-card transition-shadow group-hover:shadow-md">
                      <div className="relative aspect-[2/3] bg-muted">
                        {book.thumbnail_gcs_url ? (
                          <Image
                            src={book.thumbnail_gcs_url}
                            alt={book.title}
                            fill
                            sizes="160px"
                            unoptimized
                            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                          />
                        ) : (
<div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                              <BookOpen className="size-5" aria-hidden="true" />
                              <span className="text-xs">{t("saved.noCover")}</span>
                            </div>
                        )}
                      </div>
                      <div className="space-y-1 p-3">
                        <h4 className="line-clamp-2 min-h-9 text-sm font-medium leading-tight">
                          {book.title}
                        </h4>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {book.author}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}