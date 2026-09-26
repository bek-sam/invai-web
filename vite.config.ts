/// <reference types="vitest/config" />
import { createHash } from "node:crypto";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { connectSrc, requireApiOrigin } from "./src/lib/build/csp.ts";

// T-12-5 (B-24): strict CSP, no 'unsafe-inline'. The built app (dist/) never emits an inline
// <script> or onclick=, so its script-src is plain 'self'. The Vite dev server is the exception:
// @vitejs/plugin-react injects one fixed inline <script type="module"> (the Fast Refresh
// preamble), same bytes on every request, so it's allowed by its exact hash instead of a nonce.
const reactPreambleHash = `'sha256-${createHash("sha256")
  .update(react.preambleCode.replace("__BASE__", "/"))
  .digest("base64")}'`;
const DEV_API_ORIGIN = "http://localhost:3000"; // matches src/lib/env.ts's VITE_API_URL default
const S3_ORIGIN = "http://localhost:9000"; // local MinIO; presigned image URLs (SignedImage)

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  // Meaningless over plain http, but a browser only obeys it over https anyway, so it's safe to
  // always send -- and it must match the API's header exactly once TLS terminates in front of us.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};
const devCsp = [
  "default-src 'self'",
  `script-src 'self' ${reactPreambleHash}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${S3_ORIGIN}`,
  "font-src 'self'",
  `connect-src 'self' ${DEV_API_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

export default defineConfig(({ command, isPreview }) => {
  // Review r1: connect-src was 'https:' (any HTTPS host), not the pinned API origin. `build` and
  // `preview` both serve/produce the real prodCsp, so both must have a real VITE_API_URL -- a
  // build without it fails loudly here instead of silently falling back to a broad CSP.
  const prodConnectSrc =
    command === "build" || isPreview
      ? connectSrc(requireApiOrigin(process.env.VITE_API_URL))
      : "'self'"; // never served: only `devCsp` above governs plain `vite`/`pnpm dev`.
  const prodCsp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src ${prodConnectSrc}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

  return {
    plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
    // @invai/ui and @invai/contracts are linked sibling repos with their own node_modules;
    // dedupe so there is one React, one i18next singleton and one TanStack Table.
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "i18next",
        "react-i18next",
        "@tanstack/react-table",
        "@tanstack/react-virtual",
        "zod",
        "@orpc/contract",
      ],
    },
    // Routes are code-split, so Vite would discover these on first navigation and reload mid-session.
    optimizeDeps: {
      include: [
        "@orpc/client",
        "@orpc/client/fetch",
        "@orpc/tanstack-query",
        "better-auth/react",
        "better-auth/client/plugins",
        "react-hook-form",
        "@hookform/resolvers/zod",
        "recharts",
        "qrcode.react",
        "@tanstack/react-virtual",
        "zod",
      ],
    },
    server: { port: 5173, headers: { "Content-Security-Policy": devCsp, ...securityHeaders } },
    preview: { headers: { "Content-Security-Policy": prodCsp, ...securityHeaders } },
    test: { environment: "node", include: ["src/**/*.test.ts"] },
  };
});
