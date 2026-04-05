import pandas as pd
from datetime import date, datetime, timedelta
from jugaad_data.nse import stock_df
import time
import os
import sys
import warnings

warnings.filterwarnings("ignore")


def split_date_range(from_date, to_date, max_days=365):
    """Split a date range into chunks of max_days."""
    chunks = []
    current_start = from_date
    while current_start < to_date:
        current_end = min(current_start + timedelta(days=max_days - 1), to_date)
        chunks.append((current_start, current_end))
        current_start = current_end + timedelta(days=1)
    return chunks


def download_stock_data(symbol, from_date_str, to_date_str):
    """Download and combine historical stock data from NSE."""
    # Parse dates
    from_dt = datetime.strptime(from_date_str, "%d-%m-%Y")
    to_dt = datetime.strptime(to_date_str, "%d-%m-%Y")
    from_d = date(from_dt.year, from_dt.month, from_dt.day)
    to_d = date(to_dt.year, to_dt.month, to_dt.day)

    if from_d >= to_d:
        print("Error: From date must be before To date.")
        return None

    total_days = (to_d - from_d).days
    print(f"\nStock: {symbol.upper()}")
    print(f"Period: {from_date_str} to {to_date_str} ({total_days} days)")

    # Split into 365-day chunks
    chunks = split_date_range(from_d, to_d)
    print(f"Splitting into {len(chunks)} chunk(s) of max 365 days each.\n")

    all_dfs = []

    for i, (chunk_start, chunk_end) in enumerate(chunks, 1):
        print(f"[{i}/{len(chunks)}] Fetching: {chunk_start.strftime('%d-%m-%Y')} to {chunk_end.strftime('%d-%m-%Y')}...", end=" ")

        retries = 3
        for attempt in range(1, retries + 1):
            try:
                df = stock_df(
                    symbol=symbol.upper(),
                    from_date=chunk_start,
                    to_date=chunk_end,
                    series="EQ",
                )
                if len(df) > 0:
                    all_dfs.append(df)
                    print(f"Got {len(df)} records.")
                else:
                    print("No records.")
                break
            except Exception as e:
                if attempt < retries:
                    print(f"\n  Attempt {attempt} failed: {e}. Retrying in 5s...")
                    time.sleep(5)
                else:
                    print(f"\n  Failed after {retries} attempts: {e}")

        if i < len(chunks):
            time.sleep(3)  # Delay between requests

    if not all_dfs:
        print("\nNo data was retrieved. Please check the stock symbol and date range.")
        return None

    # Combine all chunks
    combined = pd.concat(all_dfs, ignore_index=True)

    # Clean up columns
    if "SYMBOL" in combined.columns:
        combined = combined.drop(columns=["SYMBOL"])

    # Convert DATE and sort
    combined["DATE"] = pd.to_datetime(combined["DATE"])
    combined = combined.sort_values("DATE", ascending=True).reset_index(drop=True)
    combined = combined.drop_duplicates(subset=["DATE"], keep="first")
    combined["DATE"] = combined["DATE"].dt.strftime("%d-%b-%Y")

    print(f"\nTotal records: {len(combined)}")

    # Save to Excel in downloads folder
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    downloads_dir = os.path.join(project_dir, "downloads")
    os.makedirs(downloads_dir, exist_ok=True)
    filename = f"{symbol.upper()}_Historical_{from_dt.strftime('%d%m%Y')}_to_{to_dt.strftime('%d%m%Y')}.xlsx"
    filepath = os.path.join(downloads_dir, filename)

    with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
        combined.to_excel(writer, index=False, sheet_name="Historical Data")
        worksheet = writer.sheets["Historical Data"]

        # Auto-adjust column widths
        for col_idx, column in enumerate(combined.columns, 1):
            max_length = max(
                len(str(column)),
                combined[column].astype(str).str.len().max() if len(combined) > 0 else 0,
            )
            worksheet.column_dimensions[
                worksheet.cell(row=1, column=col_idx).column_letter
            ].width = max_length + 3

    print(f"Saved to: {filepath}")
    return filepath


def main():
    print("=" * 60)
    print("       NSE India Historical Data Downloader")
    print("=" * 60)

    symbol = input("\nEnter stock symbol (e.g., RELIANCE, TCS, INFY): ").strip()
    if not symbol:
        print("Error: Stock symbol cannot be empty.")
        sys.exit(1)

    print("\nEnter date range (format: DD-MM-YYYY)")
    print("Note: For periods > 365 days, data is fetched in chunks automatically.\n")

    from_date = input("From date (e.g., 01-04-2022): ").strip()
    to_date = input("To date   (e.g., 31-03-2026): ").strip()

    try:
        datetime.strptime(from_date, "%d-%m-%Y")
        datetime.strptime(to_date, "%d-%m-%Y")
    except ValueError:
        print("Error: Invalid date format. Use DD-MM-YYYY.")
        sys.exit(1)

    download_stock_data(symbol, from_date, to_date)


if __name__ == "__main__":
    main()
