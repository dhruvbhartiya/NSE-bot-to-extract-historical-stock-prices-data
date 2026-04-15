import { ImageResponse } from "next/og";
import { siteName } from "../lib/site";

export const alt = `${siteName} Twitter preview`;
export const size = {
  width: 1200,
  height: 600,
};
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background:
            "radial-gradient(circle at top left, rgb(37, 99, 235) 0%, rgb(15, 23, 42) 55%, rgb(2, 6, 23) 100%)",
          padding: "56px",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            color: "rgb(191, 219, 254)",
            fontSize: 24,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          NSE Historical Stock Data
        </div>
        <div style={{ marginTop: 28, maxWidth: 920, fontSize: 62, fontWeight: 800, lineHeight: 1.1 }}>
          {siteName}
        </div>
        <div style={{ marginTop: 28, fontSize: 28, color: "rgb(226, 232, 240)" }}>
          Search NSE stocks, choose a date range, and download Excel-ready market data.
        </div>
      </div>
    ),
    size,
  );
}
