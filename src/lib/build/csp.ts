/**
 * Build-time CSP helpers (T-12-5, B-24, review r1): derive the API origin from `VITE_API_URL` so
 * the production `connect-src` pins the real origin the app actually calls, instead of a broad
 * `https:` that would let a stored-XSS bug exfiltrate to any HTTPS host. Shared between
 * `vite.config.ts` (the dev-preview headers) and `scripts/render-nginx-conf.ts` (the static
 * `nginx.conf` header) so both derive the same value from the same source, the same way.
 */

/**
 * `raw` is `process.env.VITE_API_URL` -- `undefined` means the variable was never set (the bug
 * this review found: a silent fallback to a broad CSP). `""` is a deliberate, valid choice (a
 * same-origin deployment, e.g. behind a reverse proxy) and is not an error.
 */
export function requireApiOrigin(raw: string | undefined): string {
  if (raw === undefined) {
    throw new Error(
      "VITE_API_URL must be set to build for production: the CSP's connect-src is derived " +
        "from it so it can pin the real API origin instead of a broad 'https:'. Set it to " +
        'the API\'s origin (e.g. "https://api.example.com"), or to "" for a same-origin ' +
        "deployment.",
    );
  }
  return raw === "" ? "" : new URL(raw).origin;
}

/**
 * B-190 (wave 20 gate issue 1): the browser PUTs uploads straight to a presigned S3 URL
 * (`src/lib/upload.ts`), so the production `connect-src` must also allow the stage's bucket
 * origin. `raw` is `process.env.VITE_S3_ORIGIN`, set per stage by invai-infra's SST config
 * (`https://<bucket>.s3.<region>.amazonaws.com`). Unset or blank means "no upload origin": the
 * CSP stays at `'self'` + API and uploads are refused, never widened to a wildcard. Only https
 * origins are accepted, except plain-http localhost (local MinIO for `vite preview`).
 */
export function uploadOrigin(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === "") return "";
  const url = new URL(raw.trim());
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const wildcard = url.hostname.includes("*");
  if (wildcard || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) {
    throw new Error(
      `VITE_S3_ORIGIN must be one https origin (or http://localhost), no wildcard; got "${raw}"`,
    );
  }
  return url.origin;
}

/**
 * `'self'` plus the API origin when it's cross-origin, plus the upload (S3) origin when given.
 * SSE rides the same origin/path as RPC calls (both `EventSource` and `fetch` are governed by
 * `connect-src`), so no extra host is needed for it.
 */
export function connectSrc(apiOrigin: string, s3Origin = ""): string {
  return ["'self'", apiOrigin, s3Origin].filter(Boolean).join(" ");
}
