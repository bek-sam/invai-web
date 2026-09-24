export interface ErrorInfo {
  code: string;
  status: number | null;
  message: string;
  data: unknown;
}

/** Normalizes oRPC errors, Better Auth errors, fetch failures and anything else. */
export function errorInfo(err: unknown): ErrorInfo {
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; status?: unknown; message?: unknown; data?: unknown };
    const code = typeof e.code === "string" ? e.code : "UNKNOWN";
    const status = typeof e.status === "number" ? e.status : null;
    let message = typeof e.message === "string" && e.message ? e.message : "Something went wrong";
    if (err instanceof TypeError && /fetch|network/i.test(message)) {
      return { code: "NETWORK", status: null, message: "Can't reach the server", data: null };
    }
    if (code === "NOT_IMPLEMENTED" || status === 501) {
      message = "This part of the API isn't available yet";
      return { code: "NOT_IMPLEMENTED", status: 501, message, data: e.data ?? null };
    }
    return { code, status, message, data: e.data ?? null };
  }
  return {
    code: "UNKNOWN",
    status: null,
    message: String(err ?? "Something went wrong"),
    data: null,
  };
}

export function errorMessage(err: unknown): string {
  return errorInfo(err).message;
}

export function isUnauthorized(err: unknown): boolean {
  const { code, status } = errorInfo(err);
  return code === "UNAUTHORIZED" || status === 401;
}

/** Retry transient failures only; never auth, permission, validation or not-implemented errors. */
export function shouldRetry(failureCount: number, err: unknown): boolean {
  const { status, code } = errorInfo(err);
  if (code === "NOT_IMPLEMENTED") return false;
  if (status !== null && status >= 400 && status < 500) return false;
  return failureCount < 2;
}
