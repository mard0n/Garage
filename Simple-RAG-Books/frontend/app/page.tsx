"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BookOpen, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSuggestions, type Book } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Book[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        const results = getSuggestions(query);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      }, 150);
    } else {
      debounceRef.current = setTimeout(() => {
        setSuggestions([]);
        setShowSuggestions(false);
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
    router.push(`/book/${encodeURIComponent(book.filename)}`);
  };

  return (
    <div className="space-y-8">
      <div className="rounded-xl border bg-card p-6 sm:p-10">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Find the right book, fast
          </h1>
          <p className="mt-2 text-muted-foreground">
            Search by title or author, or use AI to search inside book content.
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
                placeholder="Search books by title or author…"
                className="h-11 pl-9 text-base"
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="lg" disabled={!query.trim()}>
                <Search className="mr-2 size-4" aria-hidden="true" />
                Search
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={handleSemanticSearch}
                disabled={!query.trim()}
              >
                <Sparkles className="mr-2 size-4" aria-hidden="true" />
                AI Search
              </Button>
            </div>
          </form>

          {showSuggestions && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
              {suggestions.map((book) => (
                <button
                  key={book.filename}
                  onClick={() => handleSuggestionClick(book)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
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
          Tip: press{" "}
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">Enter</kbd> to run
          a text search.
        </div>
      </div>
    </div>
  );
}