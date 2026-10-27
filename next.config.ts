import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The PDF engines load native/binary assets at runtime; keep them out of the bundle.
  serverExternalPackages: [
    "playwright-core",
    "@sparticuz/chromium",
    "nodemailer",
  ],
  outputFileTracingIncludes: {
    // The PDF route reads the application's stylesheets, the bundled font files and (on a
    // serverless host) the packaged Chromium by path at runtime, so the file tracer cannot
    // discover them from imports.
    "/api/studio/**": [
      "./app/globals.css",
      "./app/tokens.css",
      "./lib/quote-pdf/fonts/**/*",
      "./node_modules/playwright-core/browsers.json",
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/quotes/*/revisions/*/pdf": [
      "./app/globals.css",
      "./app/tokens.css",
      "./lib/quote-pdf/fonts/**/*",
      "./node_modules/playwright-core/browsers.json",
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
};

export default nextConfig;
