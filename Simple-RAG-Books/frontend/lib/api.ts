import booksData from "@/db/books.json";

export interface Book {
  filename: string;
  title: string;
  author: string;
  category: string;
  pdf_gcs_url: string;
  thumbnail_gcs_url: string;
  pdf_blob_name: string;
  thumbnail_blob_name: string;
  local_path: string;
}

export interface SearchResult {
  text: string;
  score: number;
  source: string;
  pages: string;
  gcs_url: string | null;
  book_title: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export function getAllBooks(): Book[] {
  return Object.entries(booksData).map(([filename, data]) => ({
    filename,
    ...(data as Omit<Book, "filename">),
  }));
}

export function textSearch(query: string): Book[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];

  const books = getAllBooks();
  return books.filter((book) => {
    const titleMatch = book.title.toLowerCase().includes(normalizedQuery);
    const authorMatch = book.author.toLowerCase().includes(normalizedQuery);
    return titleMatch || authorMatch;
  });
}

export function getSuggestions(query: string): Book[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  const books = getAllBooks();
  return books
    .filter((book) => {
      const titleMatch = book.title.toLowerCase().includes(normalizedQuery);
      const authorMatch = book.author.toLowerCase().includes(normalizedQuery);
      return titleMatch || authorMatch;
    })
    .slice(0, 6);
}

export function getBookByFilename(filename: string): Book | null {
  const decoded = decodeURIComponent(filename);
  const bookData = booksData[decoded as keyof typeof booksData];
  if (!bookData) return null;
  return {
    filename: decoded,
    ...(bookData as Omit<Book, "filename">),
  };
}

export async function semanticSearch(query: string, topN: number = 10): Promise<SearchResponse> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, use_hyde: false, top_n: topN }),
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data.detail) {
        try {
          const parsed = JSON.parse(data.detail);
          message = parsed.error || parsed.traceback || data.detail;
        } catch {
          message = data.detail;
        }
      }
    } catch {
      message = await res.text() || message;
    }
    throw new Error(`Search failed: ${message}`);
  }

  return res.json();
}