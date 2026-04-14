import base64
import difflib
import json
import sys
import time
import warnings
from datetime import date, datetime, timedelta
from io import BytesIO
from pathlib import Path

import pandas as pd
from jugaad_data.nse import stock_df

warnings.filterwarnings("ignore")


def split_date_range(from_date, to_date, max_days=365):
    chunks = []
    current_start = from_date
    while current_start <= to_date:
        current_end = min(current_start + timedelta(days=max_days - 1), to_date)
        chunks.append((current_start, current_end))
        current_start = current_end + timedelta(days=1)
    return chunks


def load_known_symbols():
    symbols_path = Path(__file__).resolve().parent.parent / "app" / "nse-symbols.json"
    try:
        with symbols_path.open(encoding="utf-8") as file:
            data = json.load(file)
        return [item["symbol"] for item in data if item.get("symbol")]
    except Exception:
        return []


def find_similar_symbols(symbol, known_symbols, limit=5):
    if not known_symbols:
        return []
    return difflib.get_close_matches(symbol.upper(), known_symbols, n=limit, cutoff=0.5)


def extract_stock_data(symbol, from_d, to_d):
    all_dfs = []

    for chunk_start, chunk_end in split_date_range(from_d, to_d):
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
                break
            except Exception as exc:
                if "are in the [columns]" in str(exc):
                    break
                if attempt == retries:
                    raise
                time.sleep(2)

        if chunk_end < to_d:
            time.sleep(1)

    if not all_dfs:
        return None

    combined = pd.concat(all_dfs, ignore_index=True)
    if "SYMBOL" in combined.columns:
        combined = combined.drop(columns=["SYMBOL"])

    combined["DATE"] = pd.to_datetime(combined["DATE"]) + pd.Timedelta(days=1)
    combined = combined.sort_values("DATE", ascending=True).reset_index(drop=True)
    combined = combined.drop_duplicates(subset=["DATE"], keep="first")
    combined["DATE"] = combined["DATE"].dt.strftime("%d-%b-%Y")

    return combined


def dataframe_to_base64_excel(df):
    buffer = BytesIO()

    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Historical Data")
        worksheet = writer.sheets["Historical Data"]
        for col_idx, column in enumerate(df.columns, 1):
            max_length = max(
                len(str(column)),
                df[column].astype(str).str.len().max() if len(df) > 0 else 0,
            )
            worksheet.column_dimensions[
                worksheet.cell(row=1, column=col_idx).column_letter
            ].width = max_length + 3

    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("ascii")


def build_error(status_code, message, suggestions=None):
    body = {"error": message}
    if suggestions:
        body["suggestions"] = suggestions
    return {"statusCode": status_code, "body": body}


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")

        symbol = payload.get("symbol", "").strip().upper()
        from_date_str = payload.get("from_date", "").strip()
        to_date_str = payload.get("to_date", "").strip()

        if not symbol or not from_date_str or not to_date_str:
            print(json.dumps(build_error(400, "Missing required fields: symbol, from_date, to_date")))
            return

        from_dt = datetime.strptime(from_date_str, "%d-%m-%Y")
        to_dt = datetime.strptime(to_date_str, "%d-%m-%Y")
        from_d = date(from_dt.year, from_dt.month, from_dt.day)
        to_d = date(to_dt.year, to_dt.month, to_dt.day)

        if from_d >= to_d:
            print(json.dumps(build_error(400, "From date must be before To date")))
            return

        df = extract_stock_data(symbol, from_d, to_d)
        if df is None or len(df) == 0:
            suggestions = find_similar_symbols(symbol, load_known_symbols())
            message = f"No data found for '{symbol}'."
            if suggestions:
                message += f" Did you mean: {', '.join(suggestions)}?"
            print(json.dumps(build_error(400, message, suggestions)))
            return

        filename = (
            f"{symbol}_Historical_{from_dt.strftime('%d%m%Y')}"
            f"_to_{to_dt.strftime('%d%m%Y')}.xlsx"
        )

        print(
            json.dumps(
                {
                    "statusCode": 200,
                    "body": {
                        "filename": filename,
                        "rows": len(df),
                        "file_base64": dataframe_to_base64_excel(df),
                    },
                }
            )
        )
    except ValueError:
        print(json.dumps(build_error(400, "Invalid date format. Use DD-MM-YYYY.")))
    except Exception as exc:
        print(json.dumps(build_error(500, str(exc))))


if __name__ == "__main__":
    main()
