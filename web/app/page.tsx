"use client";

import { useEffect, useRef, useState } from "react";
import ExcelJS from "exceljs";
import nseSymbols from "./nse-symbols.json";

const API_URL = "/api/extract";
const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Stock = { symbol: string; name: string };
type FetchSuccess = {
  filename: string;
  rows: number;
  download_url?: string;
  file_base64?: string;
};
type FetchFailure = { error: string; suggestions?: string[] };

export default function Home() {
  const [symbol, setSymbol] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [result, setResult] = useState<{ rows: number; filename: string } | null>(
    null,
  );

  const [dropdownItems, setDropdownItems] = useState<Stock[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      .filter((stock) => {
        return (
          stock.symbol.includes(query) || stock.name.toUpperCase().includes(query)
        );
      })
      .slice(0, 8);

    setDropdownItems(matches);
    setShowDropdown(matches.length > 0);
  }, [symbol, selectedStock]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

  const splitDateRange = (from: string, to: string, maxYears: number) => {
    const fromParts = from.split("-").map(Number);
    const toParts = to.split("-").map(Number);
    const fromDateValue = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]);
    const toDateValue = new Date(toParts[0], toParts[1] - 1, toParts[2]);

    const chunks: { from: string; to: string }[] = [];
    const current = new Date(fromDateValue);

    while (current < toDateValue) {
      const chunkEnd = new Date(current);
      chunkEnd.setFullYear(chunkEnd.getFullYear() + maxYears);
      chunkEnd.setDate(chunkEnd.getDate() - 1);

      const end = chunkEnd > toDateValue ? toDateValue : chunkEnd;
      const formattedFrom = `${String(current.getDate()).padStart(2, "0")}-${String(
        current.getMonth() + 1,
      ).padStart(2, "0")}-${current.getFullYear()}`;
      const formattedTo = `${String(end.getDate()).padStart(2, "0")}-${String(
        end.getMonth() + 1,
      ).padStart(2, "0")}-${end.getFullYear()}`;

      chunks.push({ from: formattedFrom, to: formattedTo });

      current.setTime(chunkEnd.getTime());
      current.setDate(current.getDate() + 1);
    }

    return chunks;
  };

  const base64ToUint8Array = (base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  };

  const getResultArrayBuffer = async (fetchResult: FetchSuccess) => {
    if (fetchResult.file_base64) {
      const bytes = base64ToUint8Array(fetchResult.file_base64);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }

    if (!fetchResult.download_url) {
      throw new Error("The server did not return a downloadable file.");
    }

    const response = await fetch(fetchResult.download_url);
    return await response.arrayBuffer();
  };

  const triggerDownload = (fetchResult: FetchSuccess) => {
    const link = document.createElement("a");

    if (fetchResult.file_base64) {
      const bytes = base64ToUint8Array(fetchResult.file_base64);
      const blob = new Blob([bytes], { type: XLSX_MIME_TYPE });
      const objectUrl = URL.createObjectURL(blob);

      link.href = objectUrl;
      link.download = fetchResult.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      return;
    }

    if (!fetchResult.download_url) {
      throw new Error("The server did not return a download URL.");
    }

    link.href = fetchResult.download_url;
    link.download = fetchResult.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const readWorksheetRows = async (arrayBuffer: ArrayBuffer) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    const rows: unknown[][] = [];

    worksheet.eachRow({ includeEmpty: true }, (row) => {
      rows.push(Array.isArray(row.values) ? row.values.slice(1) : []);
    });

    return rows;
  };

  const downloadCombinedWorkbook = async (
    rows: unknown[][],
    headerRow: string[],
    filename: string,
  ) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Historical Data");

    rows.forEach((row) => {
      worksheet.addRow(row);
    });

    headerRow.forEach((header, columnIndex) => {
      const maxLength = Math.max(
        String(header).length,
        ...rows.slice(1).map((row) => String(row[columnIndex] || "").length),
      );
      worksheet.getColumn(columnIndex + 1).width = maxLength + 3;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: XLSX_MIME_TYPE });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  const fetchChunk = async (
    sym: string,
    from: string,
    to: string,
  ): Promise<FetchSuccess | FetchFailure> => {
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
        const data = (await response.json()) as FetchSuccess | FetchFailure;

        if (!response.ok) {
          if (response.status === 400 && "error" in data) {
            return data;
          }
          throw new Error("error" in data ? data.error : "Server error");
        }

        return data as FetchSuccess;
      } catch {
        if (attempt < 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    return { error: "Failed to connect to the server." };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setProgress("");
    setSuggestions([]);
    setResult(null);
    setShowDropdown(false);

    if (!symbol || !fromDate || !toDate) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);

    try {
      const normalizedSymbol = symbol.toUpperCase();
      const chunks = splitDateRange(fromDate, toDate, 1);

      if (chunks.length === 1) {
        setProgress("Extracting data from NSE...");
        const fetchResult = await fetchChunk(
          normalizedSymbol,
          chunks[0].from,
          chunks[0].to,
        );

        if ("error" in fetchResult) {
          setError(fetchResult.error);
          if (fetchResult.suggestions) {
            setSuggestions(fetchResult.suggestions);
          }
          return;
        }

        setResult({ rows: fetchResult.rows, filename: fetchResult.filename });
        setError("");
        setProgress("");
        triggerDownload(fetchResult);
        return;
      }

      let totalRows = 0;
      const allData: unknown[][] = [];
      let headerRow: string[] = [];

      for (let index = 0; index < chunks.length; index++) {
        setProgress(
          `Fetching part ${index + 1} of ${chunks.length}... (${chunks[index].from} to ${chunks[index].to})`,
        );

        const fetchResult = await fetchChunk(
          normalizedSymbol,
          chunks[index].from,
          chunks[index].to,
        );

        if ("error" in fetchResult) {
          if (index === 0) {
            setError(fetchResult.error);
            if (fetchResult.suggestions) {
              setSuggestions(fetchResult.suggestions);
            }
            return;
          }
          continue;
        }

        const arrayBuffer = await getResultArrayBuffer(fetchResult);
        const rows = await readWorksheetRows(arrayBuffer);

        if (rows.length > 0) {
          if (headerRow.length === 0) {
            headerRow = rows[0] as string[];
            allData.push(headerRow);
          }

          for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
            allData.push(rows[rowIndex]);
          }

          totalRows += rows.length - 1;
        }

        if (index < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (totalRows === 0) {
        setError("No data found for this date range.");
        return;
      }

      setProgress("Combining data and preparing download...");
      const fromApi = formatDateForApi(fromDate).replace(/-/g, "");
      const toApi = formatDateForApi(toDate).replace(/-/g, "");
      const filename = `${normalizedSymbol}_Historical_${fromApi}_to_${toApi}.xlsx`;

      await downloadCombinedWorkbook(allData, headerRow, filename);
      setResult({ rows: totalRows, filename });
      setError("");
      setProgress("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to fetch data from NSE.",
      );
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

        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 rounded-xl p-6 shadow-lg space-y-5"
        >
          <div ref={dropdownRef} className="relative">
            <label
              htmlFor="symbol"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Stock Symbol
            </label>
            <input
              id="symbol"
              type="text"
              autoComplete="off"
              placeholder="Type stock name or symbol..."
              value={symbol}
              onChange={(event) => handleSymbolChange(event.target.value)}
              onFocus={() => {
                if (dropdownItems.length > 0 && !selectedStock) {
                  setShowDropdown(true);
                }
              }}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {selectedStock && (
              <p className="mt-1 text-xs text-gray-400">
                {selectedStock.name || selectedStock.symbol}
              </p>
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
              <label
                htmlFor="fromDate"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                From Date
              </label>
              <input
                id="fromDate"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label
                htmlFor="toDate"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                To Date
              </label>
              <input
                id="toDate"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
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
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
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
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
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
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setSymbol(suggestion);
                        setSelectedStock(null);
                        setError("");
                        setSuggestions([]);
                      }}
                      className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                    >
                      {suggestion}
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

        <div className="mt-4 space-y-2 text-center text-xs text-gray-600">
          <p>Data is fetched directly from NSE India. Large date ranges may take longer.</p>
          <p>
            Made by Dhruv Bhartiya.{" "}
            <a
              href="https://dhruvbhartiya.com"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 transition-colors hover:text-blue-300"
            >
              dhruvbhartiya.com
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
