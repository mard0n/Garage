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
    throw new Error(`Search failed: ${res.statusText}`);
  }

  return res.json();
}
