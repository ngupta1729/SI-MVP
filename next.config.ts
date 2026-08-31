import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The API routes read the host h5p.json (twin/regenerate) and the example
  // content.json (lib/calibration.ts) from public/h5p/. Next does not bundle
  // public/ into serverless functions by default, so trace those two files
  // per host. The rest of the library tree is served statically from the CDN.
  outputFileTracingIncludes: {
    "/api/**": [
      "./public/h5p/*/h5p.json",
      "./public/h5p/*/content/content.json",
    ],
  },
};

export default nextConfig;
