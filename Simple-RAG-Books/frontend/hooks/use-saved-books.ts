"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { type Book } from "@/lib/api";

const STORAGE_PREFIX = "saved_books_";

function getStoredBooks(userId: string): Book[] {
  if (typeof window === "undefined") return [];
  const key = `${STORAGE_PREFIX}${userId}`;
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
}

export function useSavedBooks() {
  const { user, isLoaded } = useUser();
  const [savedBooks, setSavedBooks] = useState<Book[]>([]);

  const userId = user?.id;

  useEffect(() => {
    if (!isLoaded || !userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedBooks(getStoredBooks(userId));
  }, [userId, isLoaded]);

  const saveBook = useCallback((book: Book) => {
    if (!userId) return;

    const key = `${STORAGE_PREFIX}${userId}`;
    setSavedBooks((prev) => {
      if (prev.some((b) => b.filename === book.filename)) {
        return prev;
      }
      const updated = [...prev, book];
      localStorage.setItem(key, JSON.stringify(updated));
      return updated;
    });
  }, [userId]);

  const removeBook = useCallback((filename: string) => {
    if (!userId) return;

    const key = `${STORAGE_PREFIX}${userId}`;
    setSavedBooks((prev) => {
      const updated = prev.filter((b) => b.filename !== filename);
      localStorage.setItem(key, JSON.stringify(updated));
      return updated;
    });
  }, [userId]);

  const isBookSaved = useCallback((filename: string) => {
    return savedBooks.some((b) => b.filename === filename);
  }, [savedBooks]);

  const toggleBook = useCallback((book: Book) => {
    if (isBookSaved(book.filename)) {
      removeBook(book.filename);
    } else {
      saveBook(book);
    }
  }, [isBookSaved, removeBook, saveBook]);

  return {
    savedBooks,
    saveBook,
    removeBook,
    isBookSaved,
    toggleBook,
    isLoaded,
    isSignedIn: !!userId,
  };
}