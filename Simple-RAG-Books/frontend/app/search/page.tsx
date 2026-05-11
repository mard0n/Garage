"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, BookOpen, ExternalLink, Loader2, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { textSearch, semanticSearch, type Book, type SearchResponse } from "@/lib/api";

interface SearchPageProps {
  searchParams: Promise<{ q?: string; type?: string }>;
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  const params = use(searchParams);
  const router = useRouter();
  const query = params.q || "";
  const searchType = params.type || "text";

  const [books, setBooks] = useState<Book[]>([]);
  const [semanticResults, setSemanticResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState(query);

  useEffect(() => {
    const performSearch = async () => {
      setLoading(true);
      setError("");

      try {
        if (searchType === "text") {
          const results = textSearch(query);
          setBooks(results);
          setSemanticResults(null);
        } else {
          const results = await semanticSearch(query);
          setSemanticResults(results);
          setBooks([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    };

    if (query) {
      performSearch();
    } else {
      queueMicrotask(() => {
        setLoading(false);
        setBooks([]);
        setSemanticResults(null);
      });
    }
  }, [query, searchType]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchInput)}&type=${searchType}`);
    }
  };

  const toggleSearchType = (type: string) => {
    if (query) {
      router.push(`/search?q=${encodeURIComponent(query)}&type=${type}`);
    }
    setSearchInput(query);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
          <p className="text-sm text-muted-foreground">
            {searchType === "semantic"
              ? "AI semantic search inside book content."
              : "Title/author search across your library."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search books…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!searchInput.trim()}>
            Search
          </Button>
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => toggleSearchType("text")}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                searchType === "text"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <BookOpen className="size-4" aria-hidden="true" />
              Text
            </button>
            <button
              type="button"
              onClick={() => toggleSearchType("semantic")}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                searchType === "semantic"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              AI
            </button>
          </div>
        </div>
      </form>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      )}

      {error && <div className="py-12 text-center text-destructive">{error}</div>}

      {!loading && !error && searchType === "text" && books.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <BookOpen className="size-6 text-muted-foreground" aria-hidden="true" />
            <div className="font-medium">No matches</div>
            <div className="text-sm text-muted-foreground">No books found for &quot;{query}&quot;.</div>
          </CardContent>
        </Card>
      )}

      {!loading && !error && searchType === "text" && books.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            Found {books.length} book{books.length !== 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {books.map((book) => (
              <Link key={book.filename} href={`/book/${encodeURIComponent(book.filename)}`}>
                <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
                  <div className="relative aspect-[2/3] bg-muted">
                    {book.thumbnail_gcs_url ? (
                      <Image
                        src={book.thumbnail_gcs_url}
                        alt={book.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <BookOpen className="size-5" aria-hidden="true" />
                        <span className="text-xs">No cover</span>
                      </div>
                    )}
                  </div>
                  <CardContent className="space-y-1 p-3">
                    <h3 className="line-clamp-2 text-sm font-medium leading-tight">{book.title}</h3>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{book.author}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      {!loading && !error && searchType === "semantic" && semanticResults && (
        <>
          <p className="text-sm text-muted-foreground">
            Found {semanticResults.results.length} result
            {semanticResults.results.length !== 1 ? "s" : ""}
          </p>
          <div className="space-y-4">
            {semanticResults.results.map((result, index) => (
              <Card key={index} className="p-4">
                <div className="mb-2 flex items-start justify-between gap-4">
                  <h3 className="font-medium">{result.book_title || "Unknown Book"}</h3>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    Score: {result.score.toFixed(2)}
                  </span>
                </div>
                {result.pages && <p className="mb-2 text-sm text-muted-foreground">Pages: {result.pages}</p>}
                <p className="text-sm leading-relaxed">
                  {result.text.length > 300 ? result.text.slice(0, 300) + "..." : result.text}
                </p>
                {result.gcs_url && (
                  <a
                    href={result.gcs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    View PDF
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
