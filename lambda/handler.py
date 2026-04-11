import json
import os
import uuid
from datetime import date, datetime, timedelta

import boto3
import pandas as pd
from jugaad_data.nse import stock_df
import time
import warnings

warnings.filterwarnings("ignore")

S3_BUCKET = os.environ.get("S3_BUCKET", "nse-historical-downloads")
s3_client = boto3.client("s3")


def split_date_range(from_date, to_date, max_days=365):
    chunks = []
    current_start = from_date
    while current_start <= to_date:
        current_end = min(current_start + timedelta(days=max_days - 1), to_date)
        chunks.append((current_start, current_end))
        current_start = current_end + timedelta(days=1)
    return chunks


def extract_stock_data(symbol, from_d, to_d):
    chunks = split_date_range(from_d, to_d)
    all_dfs = []

    for chunk_start, chunk_end in chunks:
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
            except Exception as e:
                if "are in the [columns]" in str(e):
                    break
                if attempt < retries:
                    time.sleep(3)
                else:
                    raise Exception(f"Failed to fetch data for {chunk_start} to {chunk_end}: {e}")

        if chunk_end < to_d:
            time.sleep(2)

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


def lambda_handler(event, context):
    # Handle CORS preflight
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    try:
        body = json.loads(event.get("body", "{}"))
        symbol = body.get("symbol", "").strip().upper()
        from_date_str = body.get("from_date", "").strip()
        to_date_str = body.get("to_date", "").strip()

        if not symbol or not from_date_str or not to_date_str:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Missing required fields: symbol, from_date, to_date"}),
            }

        from_dt = datetime.strptime(from_date_str, "%d-%m-%Y")
        to_dt = datetime.strptime(to_date_str, "%d-%m-%Y")
        from_d = date(from_dt.year, from_dt.month, from_dt.day)
        to_d = date(to_dt.year, to_dt.month, to_dt.day)

        if from_d >= to_d:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "From date must be before To date"}),
            }

        # Extract data
        df = extract_stock_data(symbol, from_d, to_d)

        if df is None or len(df) == 0:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"error": f"No data found for {symbol}. Check the stock symbol."}),
            }

        # Save to Excel in /tmp/
        filename = f"{symbol}_Historical_{from_dt.strftime('%d%m%Y')}_to_{to_dt.strftime('%d%m%Y')}.xlsx"
        tmp_path = f"/tmp/{filename}"

        with pd.ExcelWriter(tmp_path, engine="openpyxl") as writer:
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

        # Upload to S3
        s3_key = f"downloads/{uuid.uuid4().hex}/{filename}"
        s3_client.upload_file(tmp_path, S3_BUCKET, s3_key)

        # Generate presigned URL (1 hour expiry)
        download_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": s3_key},
            ExpiresIn=3600,
        )

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({
                "download_url": download_url,
                "filename": filename,
                "rows": len(df),
            }),
        }

    except ValueError:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Invalid date format. Use DD-MM-YYYY."}),
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}),
        }
