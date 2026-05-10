"use client";

import { useState } from "react";
import { searchBooks, type SearchResult } from "@/lib/api";

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setResults([]);

    try {
      const res = await searchBooks(query);
      setResults(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Book Search</h1>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your books..."
            className="flex-1 px-4 py-2 border rounded-lg"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-black text-white rounded-lg disabled:opacity-50"
          >
            {loading ? "..." : "Search"}
          </button>
        </form>

        {error && <p className="text-red-600 mb-4">{error}</p>}

        <div className="space-y-4">
          {results.map((r, i) => (
            <div key={i} className="bg-white p-4 rounded-lg border">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium">{r.book_title || "Unknown"}</span>
                <span className="text-sm text-zinc-500">Score: {r.score.toFixed(2)}</span>
              </div>
              <p className="text-zinc-700 mb-2">
                {r.text.length > 200 ? r.text.slice(0, 200) + "..." : r.text}
              </p>
              <div className="flex gap-4 text-sm text-zinc-500">
                {r.pages && <span>Pages: {r.pages}</span>}
                {r.gcs_url && (
                  <a
                    href={r.gcs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  >
                    View PDF
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {!loading && results.length === 0 && !error && (
          <p className="text-zinc-500">Enter a query to search books.</p>
        )}
      </div>
    </div>
  );
}