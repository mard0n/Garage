"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getAllBooks, getSuggestions, type Book } from "@/lib/api";
import { useTranslation } from "react-i18next";

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Book[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allBooks = getAllBooks();

  const categories = useMemo(() => {
    const grouped = allBooks.reduce<Record<string, Book[]>>((acc, book) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        const results = getSuggestions(query);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setActiveSuggestionIndex(-1);
      }, 150);
    } else {
      debounceRef.current = setTimeout(() => {
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
      }, 0);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleTextSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(query)}&type=text`);
  };

  const handleSemanticSearch = () => {
    if (!query.trim()) return;
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(query)}&type=semantic`);
  };

  const handleSuggestionClick = (book: Book) => {
    setQuery(book.title);
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
    router.push(`/book/${encodeURIComponent(book.filename)}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1
      );
      return;
    }

    if (e.key === "Enter" && activeSuggestionIndex >= 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[activeSuggestionIndex]);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setShowSuggestions(false);
      setActiveSuggestionIndex(-1);
    }
  };

  return (
    <div className="space-y-10">
      <div className="rounded-xl border border-border bg-card p-6 sm:p-10">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("home.title")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t("home.description")}
          </p>
        </div>

        <div ref={containerRef} className="relative mx-auto mt-8 max-w-2xl space-y-2">
          <form onSubmit={handleTextSearch} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t("home.searchPlaceholder")}
                className="h-11 pl-9 text-base"
                role="combobox"
                aria-expanded={showSuggestions}
                aria-controls="book-suggestions"
                aria-activedescendant={
                  activeSuggestionIndex >= 0
                    ? `book-suggestion-${activeSuggestionIndex}`
                    : undefined
                }
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="lg" disabled={!query.trim()}>
                <Search className="mr-2 size-4" aria-hidden="true" />
                {t("home.search")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={handleSemanticSearch}
                disabled={!query.trim()}
              >
                <Sparkles className="mr-2 size-4" aria-hidden="true" />
                {t("home.aiSearch")}
              </Button>
            </div>
          </form>

          {showSuggestions && (
            <div
              id="book-suggestions"
              role="listbox"
              className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
            >
              {suggestions.map((book, index) => (
                <button
                  key={book.filename}
                  id={`book-suggestion-${index}`}
                  role="option"
                  aria-selected={activeSuggestionIndex === index}
                  onClick={() => handleSuggestionClick(book)}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent ${
                    activeSuggestionIndex === index ? "bg-accent" : ""
                  }`}
                >
                  {book.thumbnail_gcs_url ? (
                    <Image
                      src={book.thumbnail_gcs_url}
                      alt={book.title}
                      width={32}
                      height={40}
                      unoptimized
                      className="h-10 w-8 rounded object-cover"
                    />
                  ) : (
                    <div className="grid h-10 w-8 place-items-center rounded bg-muted text-muted-foreground">
                      <BookOpen className="size-4" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{book.title}</div>
                    <div className="truncate text-sm text-muted-foreground">{book.author}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {t("home.tip")}
        </div>
      </div>

      <section className="space-y-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{t("home.browseBooks")}</h2>
            <p className="text-sm text-muted-foreground">
              {categories.reduce((total, category) => total + category.books.length, 0)} {t("home.books.one")} {t("home.categoriesCount")}
            </p>
          </div>
        </div>

        <div className="space-y-8">
          {categories.map((category) => (
            <div key={category.name} className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold tracking-tight">{category.name}</h3>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {category.books.length} {t("home.books")}
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
                              <span className="text-xs">{t("home.noCover")}</span>
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
      </section>
    </div>
  );
}
