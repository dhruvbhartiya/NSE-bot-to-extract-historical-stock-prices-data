"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function Home() {
  const [symbol, setSymbol] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [result, setResult] = useState<{ rows: number; filename: string } | null>(null);

  const formatDateForApi = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    return `${day}-${month}-${year}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuggestions([]);
    setResult(null);

    if (!symbol || !fromDate || !toDate) {
      setError("Please fill in all fields.");
      return;
    }

    if (!API_URL) {
      setError("API URL not configured. Set NEXT_PUBLIC_API_URL environment variable.");
      return;
    }

    setLoading(true);

    try {
      const payload = JSON.stringify({
        symbol: symbol.toUpperCase(),
        from_date: formatDateForApi(fromDate),
        to_date: formatDateForApi(toDate),
      });

      // Retry up to 2 times (handles Lambda cold starts)
      let lastError = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) setError("Retrying... (server was warming up)");

          const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          });

          const data = await response.json();

          if (!response.ok) {
            setError(data.error || "Something went wrong.");
            if (data.suggestions) setSuggestions(data.suggestions);
            return;
          }

          setResult({ rows: data.rows, filename: data.filename });
          setError("");

          // Auto-trigger download
          const link = document.createElement("a");
          link.href = data.download_url;
          link.download = data.filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return;
        } catch {
          lastError = attempt === 0
            ? "Server is warming up, retrying automatically..."
            : "Failed to connect to the server. Please try again.";
        }
      }

      setError(lastError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center bg-gray-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">NSE Historical Data</h1>
          <p className="text-gray-400 mt-2">
            Download historical stock prices from NSE India
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-6 shadow-lg space-y-5">
          <div>
            <label htmlFor="symbol" className="block text-sm font-medium text-gray-300 mb-1">
              Stock Symbol
            </label>
            <input
              id="symbol"
              type="text"
              placeholder="e.g. RELIANCE, TCS, INFY"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="fromDate" className="block text-sm font-medium text-gray-300 mb-1">
                From Date
              </label>
              <input
                id="fromDate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="toDate" className="block text-sm font-medium text-gray-300 mb-1">
                To Date
              </label>
              <input
                id="toDate"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Extracting data from NSE...
              </span>
            ) : (
              "Download Historical Data"
            )}
          </button>

          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
              {suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-red-400">Try:</span>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setSymbol(s); setError(""); setSuggestions([]); }}
                      className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-300 text-sm">
              Downloaded {result.rows} records as {result.filename}
            </div>
          )}
        </form>

        <p className="text-gray-600 text-xs text-center mt-4">
          Data is fetched directly from NSE India. Large date ranges may take longer.
        </p>
      </div>
    </main>
  );
}
