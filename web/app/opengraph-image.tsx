import { ImageResponse } from "next/og";
import { siteDescription, siteName } from "../lib/site";

export const alt = `${siteName} social preview`;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(135deg, rgb(2, 6, 23) 0%, rgb(17, 24, 39) 50%, rgb(30, 64, 175) 100%)",
          padding: "56px",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            color: "rgb(191, 219, 254)",
            fontSize: 28,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              height: 16,
              width: 16,
              borderRadius: 9999,
              backgroundColor: "rgb(96, 165, 250)",
            }}
          />
          NSE India Market Data
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05 }}>
            {siteName}
          </div>
          <div style={{ maxWidth: 980, color: "rgb(226, 232, 240)", fontSize: 30, lineHeight: 1.35 }}>
            {siteDescription}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: "rgb(147, 197, 253)",
          }}
        >
          <div>Download historical NSE stock data in Excel</div>
          <div>dhruvbhartiya.com</div>
        </div>
      </div>
    ),
    size,
  );
}
