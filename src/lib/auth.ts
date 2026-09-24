import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { API_URL } from "./env";

/** Better Auth client. Companies are organizations; the session cookie is sent cross-origin. */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [organizationClient()],
  fetchOptions: { credentials: "include" },
});

export type AuthResult = { error: { message?: string; status?: number } | null };

/** Throws with the server's message when a Better Auth call returns an error. */
export function unwrapAuth<T extends AuthResult>(res: T): T {
  if (res.error)
    throw new Error(res.error.message || `Request failed (${res.error.status ?? "?"})`);
  return res;
}
