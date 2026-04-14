"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import nseSymbols from "./nse-symbols.json";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type Stock = { symbol: string; name: string };

export default function Home() {
  const [symbol, setSymbol] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [result, setResult] = useState<{ rows: number; filename: string } | null>(null);

  // Autocomplete state
  const [dropdownItems, setDropdownItems] = useState<Stock[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter stocks as user types
  useEffect(() => {
    if (!symbol || symbol.length < 1) {
      setDropdownItems([]);
      setShowDropdown(false);
      return;
    }

    if (selectedStock && selectedStock.symbol === symbol) {
      setShowDropdown(false);
      return;
    }

    const query = symbol.toUpperCase();
    const matches = (nseSymbols as Stock[])
      .filter(
        (s) =>
          s.symbol.includes(query) ||
          s.name.toUpperCase().includes(query)
      )
      .slice(0, 8);

    setDropdownItems(matches);
    setShowDropdown(matches.length > 0);
  }, [symbol, selectedStock]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectStock = (stock: Stock) => {
    setSymbol(stock.symbol);
    setSelectedStock(stock);
    setShowDropdown(false);
    setError("");
    setSuggestions([]);
  };

  const handleSymbolChange = (value: string) => {
    setSymbol(value.toUpperCase());
    setSelectedStock(null);
  };

  const formatDateForApi = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    return `${day}-${month}-${year}`;
  };

  // Split date range into chunks of maxYears
  const splitDateRange = (from: string, to: string, maxYears: number) => {
    const fromParts = from.split("-").map(Number); // YYYY-MM-DD
    const toParts = to.split("-").map(Number);
    const fromDate = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]);
    const toDate = new Date(toParts[0], toParts[1] - 1, toParts[2]);

    const chunks: { from: string; to: string }[] = [];
    const current = new Date(fromDate);

    while (current < toDate) {
      const chunkEnd = new Date(current);
      chunkEnd.setFullYear(chunkEnd.getFullYear() + maxYears);
      chunkEnd.setDate(chunkEnd.getDate() - 1);

      const end = chunkEnd > toDate ? toDate : chunkEnd;
      const fmtFrom = `${String(current.getDate()).padStart(2, "0")}-${String(current.getMonth() + 1).padStart(2, "0")}-${current.getFullYear()}`;
      const fmtTo = `${String(end.getDate()).padStart(2, "0")}-${String(end.getMonth() + 1).padStart(2, "0")}-${end.getFullYear()}`;
      chunks.push({ from: fmtFrom, to: fmtTo });

      current.setTime(chunkEnd.getTime());
      current.setDate(current.getDate() + 1);
    }
    return chunks;
  };

  // Single API call with retry
  const fetchChunk = async (sym: string, from: string, to: string): Promise<{ download_url: string; filename: string; rows: number } | { error: string; suggestions?: string[] }> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);

        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: sym, from_date: from, to_date: to }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await response.json();

        if (!response.ok) {
          if (response.status === 400) return { error: data.error, suggestions: data.suggestions };
          throw new Error(data.error || "Server error");
        }

        return data;
      } catch {
        if (attempt < 1) await new Promise(r => setTimeout(r, 1000));
      }
    }
    return { error: "Failed to connect to the server." };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setProgress("");
    setSuggestions([]);
    setResult(null);
    setShowDropdown(false);

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
      const sym = symbol.toUpperCase();

      // Split into 1-year chunks to stay within API Gateway 29s timeout
      const chunks = splitDateRange(fromDate, toDate, 1);

      if (chunks.length === 1) {
        // Single chunk — simple flow
        setProgress("Extracting data from NSE...");
        const result = await fetchChunk(sym, chunks[0].from, chunks[0].to);

        if ("error" in result) {
          setError(result.error);
          if (result.suggestions) setSuggestions(result.suggestions);
          return;
        }

        setResult({ rows: result.rows, filename: result.filename });
        setError("");
        setProgress("");

        const link = document.createElement("a");
        link.href = result.download_url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // Multiple chunks — fetch each, combine into one Excel file
        let totalRows = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allData: any[][] = [];
        let headerRow: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
          setProgress(`Fetching part ${i + 1} of ${chunks.length}... (${chunks[i].from} to ${chunks[i].to})`);

          const result = await fetchChunk(sym, chunks[i].from, chunks[i].to);

          if ("error" in result) {
            if (i === 0) {
              setError(result.error);
              if (result.suggestions) setSuggestions(result.suggestions);
              return;
            }
            continue;
          }

          // Download the Excel file and read its data
          const response = await fetch(result.download_url);
          const arrayBuffer = await response.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

          if (rows.length > 0) {
            if (headerRow.length === 0) {
              headerRow = rows[0] as string[];
              allData.push(headerRow);
            }
            // Add data rows (skip header)
            for (let r = 1; r < rows.length; r++) {
              allData.push(rows[r]);
            }
            totalRows += rows.length - 1;
          }

          if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
        }

        if (totalRows === 0) {
          setError("No data found for this date range.");
          return;
        }

        // Create combined Excel file
        setProgress("Combining data and preparing download...");
        const ws = XLSX.utils.aoa_to_sheet(allData);

        // Auto-adjust column widths
        const colWidths = headerRow.map((h, i) => {
          const maxLen = Math.max(
            String(h).length,
            ...allData.slice(1).map(row => String(row[i] || "").length)
          );
          return { wch: maxLen + 3 };
        });
        ws["!cols"] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Historical Data");

        const fromApi = formatDateForApi(fromDate).replace(/-/g, "");
        const toApi = formatDateForApi(toDate).replace(/-/g, "");
        const filename = `${sym}_Historical_${fromApi}_to_${toApi}.xlsx`;

        XLSX.writeFile(wb, filename);

        setResult({ rows: totalRows, filename });
        setError("");
      }
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
          <div ref={dropdownRef} className="relative">
            <label htmlFor="symbol" className="block text-sm font-medium text-gray-300 mb-1">
              Stock Symbol
            </label>
            <input
              ref={inputRef}
              id="symbol"
              type="text"
              autoComplete="off"
              placeholder="Type stock name or symbol..."
              value={symbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
              onFocus={() => { if (dropdownItems.length > 0 && !selectedStock) setShowDropdown(true); }}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {selectedStock && (
              <p className="mt-1 text-xs text-gray-400">{selectedStock.name || selectedStock.symbol}</p>
            )}

            {showDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {dropdownItems.map((stock) => (
                  <button
                    key={stock.symbol}
                    type="button"
                    onClick={() => handleSelectStock(stock)}
                    className="w-full px-4 py-2.5 text-left hover:bg-gray-700 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <span className="text-white font-medium">{stock.symbol}</span>
                      {stock.name && (
                        <span className="text-gray-400 text-sm ml-2">{stock.name}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
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

          {progress && !error && (
            <div className="p-3 bg-blue-900/50 border border-blue-700 rounded-lg text-blue-300 text-sm flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {progress}
            </div>
          )}

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
                      onClick={() => { setSymbol(s); setSelectedStock(null); setError(""); setSuggestions([]); }}
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
