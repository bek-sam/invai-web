import { useMemo } from "react";
import { parseMarkdown } from "../content/markdown";
import { MarkdownBlocks } from "../content/markdown-view";

/**
 * Renders an assistant answer. The text is untrusted model output (it can echo order data), so it
 * goes through the parser's "ai" mode: no images, no external links, raw HTML stays literal text.
 * Re-parsed on each streamed chunk; an unclosed `**` simply shows as text until it closes.
 */
export function AssistantAnswer({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text, { source: "ai" }).blocks, [text]);
  if (!text) return null;
  return <MarkdownBlocks blocks={blocks} compact />;
}
