/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
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
  server: { port: 5173 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
