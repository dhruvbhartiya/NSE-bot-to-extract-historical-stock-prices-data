"""Refresh the NSE symbols JSON file used for autocomplete.
Run this periodically to include newly listed stocks.

Usage: python scripts/refresh_symbols.py
"""

import requests
import json
import time
import os
from jugaad_data.nse import NSELive


def main():
    print("Fetching NSE stock list...")

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    session.get("https://www.nseindia.com", timeout=10)

    # Step 1: Get all symbols from pre-open market data
    r = session.get("https://www.nseindia.com/api/market-data-pre-open?key=ALL", timeout=10)
    data = r.json()["data"]
    symbols = sorted(set(item["metadata"]["symbol"] for item in data if item.get("metadata", {}).get("symbol")))
    print(f"Found {len(symbols)} symbols from NSE.")

    # Step 2: Get company names from NIFTY indices
    names = {}
    nse = NSELive()
    for idx in ["NIFTY 500", "NIFTY TOTAL MARKET", "NIFTY MICROCAP 250"]:
        try:
            idx_data = nse.live_index(idx)
            if idx_data and "data" in idx_data:
                for s in idx_data["data"]:
                    sym = s.get("symbol", "")
                    name = s.get("meta", {}).get("companyName", "")
                    if sym and name:
                        names[sym] = name
        except Exception:
            pass
    print(f"Got company names for {len(names)} stocks from indices.")

    # Step 3: Fetch remaining names via search API
    missing = [s for s in symbols if s not in names]
    print(f"Fetching names for {len(missing)} remaining stocks...")
    count = 0
    for sym in missing:
        try:
            r = session.get(f"https://www.nseindia.com/api/search/autocomplete?q={sym}", timeout=5)
            if r.status_code == 200:
                for item in r.json().get("symbols", []):
                    if item.get("symbol") == sym:
                        names[sym] = item.get("symbol_info", "")
                        break
            elif r.status_code == 403:
                time.sleep(3)
                session.get("https://www.nseindia.com", timeout=10)
            count += 1
            if count % 30 == 0:
                time.sleep(2)
                print(f"  {count}/{len(missing)}...")
        except Exception:
            time.sleep(2)
            try:
                session.get("https://www.nseindia.com", timeout=10)
            except Exception:
                pass

    # Step 4: Build and save JSON
    stocks = [{"symbol": s, "name": names.get(s, "")} for s in symbols]
    named = sum(1 for s in stocks if s["name"])

    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "..", "web", "app", "nse-symbols.json")
    with open(output_path, "w") as f:
        json.dump(stocks, f)

    print(f"\nSaved {len(stocks)} stocks ({named} with company names) to {output_path}")
    print("Now redeploy Vercel: cd web && vercel --prod")


if __name__ == "__main__":
    main()
