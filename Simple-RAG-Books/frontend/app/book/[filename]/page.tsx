"use client";

import { use } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, BookOpen, ExternalLink, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getBookByFilename, type Book } from "@/lib/api";
import { useSavedBooks } from "@/hooks/use-saved-books";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useTranslation } from "react-i18next";

interface BookPageProps {
  params: Promise<{ filename: string }>;
}

export default function BookPage({ params }: BookPageProps) {
  const { t } = useTranslation();
  const resolvedParams = use(params);
  const book: Book | null = getBookByFilename(resolvedParams.filename);
  const { isSignedIn, isBookSaved, toggleBook } = useSavedBooks();
  const { isLoaded } = useUser();

  if (!book) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <BookOpen className="size-6 text-muted-foreground" aria-hidden="true" />
          <div className="text-destructive font-medium">{t("book.notFound")}</div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/">
              <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
              {t("book.backToSearch")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("book.backToSearch")}
      </Link>

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="w-full shrink-0 sm:w-52">
          <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
            {book.thumbnail_gcs_url ? (
              <Image
                src={book.thumbnail_gcs_url}
                alt={book.title}
                fill
                sizes="208px"
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <BookOpen className="size-6" aria-hidden="true" />
                <span className="text-sm">{t("book.noCover")}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight">{book.title}</h1>
            <p className="text-muted-foreground">{book.author}</p>
          </div>

          {book.category && (
            <p className="text-sm">
              <span className="text-muted-foreground">{t("book.category")}: </span>
              {book.category}
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            {book.pdf_gcs_url && (
              <Button asChild>
                <a href={book.pdf_gcs_url} target="_blank" rel="noopener noreferrer">
                  {t("book.readPdf")}
                  <ExternalLink className="ml-2 size-4" aria-hidden="true" />
                </a>
              </Button>
            )}
            {isLoaded && isSignedIn && (
<Button
                  type="button"
                  variant={isBookSaved(book.filename) ? "secondary" : "outline"}
                  size="lg"
                  onClick={() => toggleBook(book)}
                >
                  <Bookmark
                    className={`mr-2 size-4 ${isBookSaved(book.filename) ? "fill-current" : ""}`}
                    aria-hidden="true"
                  />
                  {isBookSaved(book.filename) ? t("book.saved") : t("book.save")}
                </Button>
            )}
            {isLoaded && !isSignedIn && (
              <SignInButton mode="modal">
                <Button type="button" variant="outline" size="lg">
                  <Bookmark className="mr-2 size-4" aria-hidden="true" />
                  {t("book.save")}
                </Button>
              </SignInButton>
            )}
          </div>
        </div>
      </div>

<Card>
        <CardContent className="p-6 pt-4">
          <h2 className="text-lg font-medium">{t("book.aboutTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("book.aboutDescription")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}