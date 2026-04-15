import type { MetadataRoute } from "next";
import { siteDescription, siteName } from "../lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteName,
    short_name: "NSE Data",
    description: siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
