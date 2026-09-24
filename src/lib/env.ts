/** API origin, e.g. http://localhost:3000. Falls back to the local default. */
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";
