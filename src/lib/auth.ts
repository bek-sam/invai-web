import {
  inferAdditionalFields,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { API_URL } from "./env";

/**
 * Better Auth client. Companies are organizations; the session cookie is sent cross-origin.
 * Two-step sign-in: `signIn.email` answers `{ twoFactorRedirect: true }` and the login page asks
 * for the code itself. `locale` (en | es) is the user's email language.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    organizationClient(),
    twoFactorClient(),
    inferAdditionalFields({ user: { locale: { type: "string", required: false } } }),
  ],
  fetchOptions: { credentials: "include" },
});

export type AuthResult = { error: { message?: string; status?: number } | null };

/** Throws with the server's message when a Better Auth call returns an error. */
export function unwrapAuth<T extends AuthResult>(res: T): T {
  if (res.error)
    throw new Error(res.error.message || `Request failed (${res.error.status ?? "?"})`);
  return res;
}
