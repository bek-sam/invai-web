import { queryOptions, useQuery } from "@tanstack/react-query";
import { authClient } from "../../lib/auth";

/** The Better Auth session (user.emailVerified, twoFactorEnabled, locale; session.token). */
export const authSessionQueryOptions = () =>
  queryOptions({
    queryKey: ["auth", "session"],
    queryFn: () => authClient.getSession(),
    staleTime: 0,
  });

export function useAuthSession() {
  const q = useQuery(authSessionQueryOptions());
  return { ...q, session: q.data?.data ?? null };
}

export type AppLocale = "en" | "es";

export function toLocale(v: unknown): AppLocale {
  return v === "es" ? "es" : "en";
}

/** The base32 secret inside an otpauth:// URI, for people who type it into their app. */
export function totpSecret(uri: string): string | null {
  try {
    const secret = new URL(uri).searchParams.get("secret");
    return secret ? secret.replace(/(.{4})(?=.)/g, "$1 ") : null;
  } catch {
    return null;
  }
}

export type DeviceKind = "phone" | "tablet" | "computer";

/** A short "Chrome on macOS" style label from a user-agent string; never the raw string. */
export function describeDevice(ua: string | null | undefined): {
  browser: string | null;
  os: string | null;
  kind: DeviceKind;
} {
  const s = ua ?? "";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /Firefox\//.test(s)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(s)
          ? "Chrome"
          : /Safari\//.test(s)
            ? "Safari"
            : /curl\//.test(s)
              ? "curl"
              : null;
  const os = /iPhone|iPad|iPod/.test(s)
    ? "iOS"
    : /Android/.test(s)
      ? "Android"
      : /Mac OS X|Macintosh/.test(s)
        ? "macOS"
        : /Windows/.test(s)
          ? "Windows"
          : /CrOS/.test(s)
            ? "ChromeOS"
            : /Linux/.test(s)
              ? "Linux"
              : null;
  const kind: DeviceKind = /iPad|Tablet/.test(s)
    ? "tablet"
    : /Mobi|iPhone|Android/.test(s)
      ? "phone"
      : "computer";
  return { browser, os, kind };
}

type SessionData = NonNullable<ReturnType<typeof useAuthSession>["session"]>;
export type AuthUser = SessionData["user"];
