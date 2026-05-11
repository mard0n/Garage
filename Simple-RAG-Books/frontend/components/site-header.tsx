"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Bookmark, Library, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = React.useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    router.push(`/search?q=${encodeURIComponent(query)}&type=text`);
  };

  const onAiSearch = () => {
    const query = q.trim();
    if (!query) return;
    router.push(`/search?q=${encodeURIComponent(query)}&type=semantic`);
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Simple RAG Books</div>
            <div className="text-xs text-muted-foreground">Search your library</div>
          </div>
        </Link>

        <div className="flex-1" />

        <nav className="hidden items-center gap-1 sm:flex">
          <Button asChild variant={pathname === "/" ? "secondary" : "ghost"} size="sm">
            <Link href="/" className="gap-2">
              <Library className="size-4" aria-hidden="true" />
              Library
            </Link>
          </Button>
          <Button asChild variant={pathname?.startsWith("/search") ? "secondary" : "ghost"} size="sm">
            <Link href="/search" className="gap-2">
              <Search className="size-4" aria-hidden="true" />
              Search
            </Link>
          </Button>
        </nav>

        <div className="hidden w-[420px] items-center gap-2 md:flex">
          <form onSubmit={onSubmit} className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by title or author…"
                className="pl-9"
              />
            </div>
            <Button type="submit" size="sm">
              <Bookmark className="mr-2 size-4" aria-hidden="true" />
              Search
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onAiSearch} disabled={!q.trim()}>
              <Sparkles className="mr-2 size-4" aria-hidden="true" />
              AI
            </Button>
          </form>
        </div>

        <div className="flex items-center gap-1" />
      </div>
    </header>
  );
}

