// Pulls the transition reason out of a timeline entry's free-text `message`, without
// translating it (it has no typed field yet; a `reasonCode` is the architect's follow-up
// alongside B-224). The backend builds `message` as
// `${from ?? "new"} → ${to}${reason ? ` (${reason})` : ""}` (invai-backend/src/modules/orders/service.ts).
// We strip that exact prefix and its ` (`…`)` wrapper to recover the raw reason, per the
// tech lead's round 2 ruling on T-P2-4.
export type TimelineReason =
  | { type: "reason"; text: string }
  | { type: "none" }
  // The message didn't start with the expected prefix (unexpected/old format): show it as-is.
  | { type: "raw"; text: string };

export function extractTimelineReason(
  message: string,
  from: string | null,
  to: string,
): TimelineReason {
  const prefix = `${from ?? "new"} → ${to}`;
  if (!message.startsWith(prefix)) {
    return { type: "raw", text: message };
  }
  const rest = message.slice(prefix.length);
  if (rest.startsWith(" (") && rest.endsWith(")")) {
    return { type: "reason", text: rest.slice(2, -1) };
  }
  return { type: "none" };
}
