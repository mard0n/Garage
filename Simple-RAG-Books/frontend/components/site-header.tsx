"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Library, LogIn, Bookmark } from "lucide-react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const pathname = usePathname();
  const { isSignedIn } = useUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
          </span>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-semibold tracking-tight">Simple RAG Books</div>
            <div className="text-xs text-muted-foreground">Search your library</div>
          </div>
        </Link>

        <div className="flex-1" />

        <nav className="flex items-center gap-1">
          <Button asChild variant={pathname === "/" ? "secondary" : "ghost"} size="sm">
            <Link href="/" className="gap-2">
              <Library className="size-4" aria-hidden="true" />
              <span>Browse</span>
            </Link>
          </Button>
          {isSignedIn && (
            <Button asChild variant={pathname === "/saved" ? "secondary" : "ghost"} size="sm">
              <Link href="/saved" className="gap-2">
                <Bookmark className="size-4" aria-hidden="true" />
                <span>Saved</span>
              </Link>
            </Button>
          )}
        </nav>

        {isSignedIn ? (
          <UserButton />
        ) : (
          <SignInButton mode="modal">
            <Button type="button" variant="outline" size="sm" className="gap-2">
              <LogIn className="size-4" aria-hidden="true" />
              <span>Sign in</span>
            </Button>
          </SignInButton>
        )}
      </div>
    </header>
  );
}
