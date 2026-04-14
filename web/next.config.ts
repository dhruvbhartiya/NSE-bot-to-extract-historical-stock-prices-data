import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/extract": ["./scripts/local_extract.py"],
  },
};

export default nextConfig;
