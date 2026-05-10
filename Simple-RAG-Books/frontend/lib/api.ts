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

export async function searchBooks(query: string): Promise<SearchResponse> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, use_hyde: false, top_n: 10 }),
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
