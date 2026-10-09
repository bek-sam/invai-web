import type { MarketRecommendation } from "@invai/contracts";
import { Button, cn, RelativeTime, Textarea } from "@invai/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { Bot, Loader2, MessageSquarePlus, Send, Square, User, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AssistantAnswer } from "../../components/assistant-answer";
import { RecommendationCard } from "../../components/market/recommendation-card";
import { SampleDataBadge } from "../../components/market/sample-data-badge";
import { ErrorState } from "../../components/states";
import { errorMessage } from "../../lib/errors";
import { client, orpc } from "../../lib/rpc";

export const Route = createFileRoute("/_app/assistant")({
  component: AssistantPage,
});

/**
 * Maps the assistant stream's `error` event (B-262) to a plain-language, translated line.
 * Codes come from `invai-backend/src/modules/ai/service.ts:1320-1327`. `credits_exhausted`
 * reuses the exact wording the billing screens already show for that same backend code
 * (`upgrade.limit.aiCredits`), so the shop sees one consistent message everywhere. A missing or
 * unknown code (including `rate_limited`, which the service doesn't send today) keeps the
 * server's own English text, same as before this mapping existed.
 */
export function assistantErrorMessage(
  t: TFunction,
  code: string | undefined,
  message: string,
): string {
  switch (code) {
    case "spend_cap":
      return t(
        "assistant.error.spendCap",
        "Today's AI limit has been reached. Try again tomorrow.",
      );
    case "credits_exhausted":
      return t(
        "upgrade.limit.aiCredits",
        "This month's AI credits are used up. Buy a credit pack or upgrade your plan to keep using AI.",
      );
    case "refusal":
    case "internal":
      return t("assistant.error.cantAnswer", "I couldn't answer that. Try again.");
    default:
      return message;
  }
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: string[];
  error?: string;
  streaming?: boolean;
  /** True when any tool result behind this message rested on a mock source (spec AC3, AC30). */
  mock?: boolean;
  /** Recommendation ids shown by this message's tool results (spec AC33), newest turn first. */
  recommendationIds?: string[];
}

function AssistantPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [recommendationsById, setRecommendationsById] = useState<
    Record<string, MarketRecommendation>
  >({});
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversations = useQuery(
    orpc.ai.assistant.conversations.queryOptions({ input: { limit: 30 }, retry: false }),
  );
  const credits = useQuery(orpc.ai.credits.balance.queryOptions({ input: {}, retry: false }));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  const starters = [
    t("assistant.starter.review", "Give me a weekly business review"),
    t("assistant.starter.ads", "Are my ads paying off?"),
    t("assistant.starter.designs", "Which designs are rising or falling?"),
    t("assistant.starter.shipping", "Am I shipping on time?"),
    // Market signals starters (spec "User flow" step 1, AC2), alongside the wave 17 starters.
    t("assistant.starter.marketTrend", "Which of my designs are trending?"),
    t("assistant.starter.marketPrice", "Am I priced right on Amazon?"),
    t("assistant.starter.marketSeason", "When should I get ready for the holidays?"),
  ];

  // Fetches the full recommendation records (band, params, vote, mock) for ids carried on a
  // stream event or a stored message, so vote cards render the fixed action copy and survive a
  // conversation reload (AC33). Recommendation list/vote need `finance.read`; a caller without it
  // never sees a market question in the first place, so this never fires for a designer.
  async function hydrateRecommendations(ids: string[]) {
    if (ids.length === 0) return;
    try {
      const res = await client.market.recommendations.list({ ids, limit: ids.length });
      setRecommendationsById((prev) => {
        const next = { ...prev };
        for (const r of res.items) next[r.id] = r;
        return next;
      });
    } catch {
      // Best-effort: the card still renders the answer text without vote cards.
    }
  }

  async function openConversation(id: string) {
    if (streaming) return;
    try {
      const c = await client.ai.assistant.conversation({ id });
      setConversationId(c.id);
      setMessages(
        c.messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          tools: [],
          mock: m.mock,
          recommendationIds: m.recommendations?.map((r) => r.id),
        })),
      );
      void hydrateRecommendations(
        c.messages.flatMap((m) => m.recommendations?.map((r) => r.id) ?? []),
      );
    } catch (e) {
      setMessages([{ id: "err", role: "assistant", text: "", tools: [], error: errorMessage(e) }]);
    }
  }

  async function ask(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setInput("");
    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", text: message, tools: [] },
      { id: assistantId, role: "assistant", text: "", tools: [], streaming: true },
    ]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((ms) => ms.map((m) => (m.id === assistantId ? fn(m) : m)));
    try {
      const stream = await client.ai.assistant.ask(
        { message, conversationId },
        { signal: controller.signal },
      );
      for await (const ev of stream) {
        if (ev.type === "start") setConversationId(ev.conversationId);
        else if (ev.type === "text_delta") patch((m) => ({ ...m, text: m.text + ev.text }));
        else if (ev.type === "tool_call")
          patch((m) => ({
            ...m,
            tools: [...m.tools, t(`assistant.tool.${ev.name}`, ev.name.replace(/_/g, " "))],
          }));
        else if (ev.type === "tool_result") {
          const newIds = ev.recommendations?.map((r) => r.id) ?? [];
          patch((m) => ({
            ...m,
            mock: m.mock || ev.mock === true,
            recommendationIds: [...new Set([...(m.recommendationIds ?? []), ...newIds])],
          }));
          void hydrateRecommendations(newIds);
        } else if (ev.type === "error")
          patch((m) => ({ ...m, error: assistantErrorMessage(t, ev.code, ev.message) }));
        else if (ev.type === "done") setConversationId(ev.conversationId);
      }
    } catch (e) {
      if (!controller.signal.aborted) patch((m) => ({ ...m, error: errorMessage(e) }));
    } finally {
      patch((m) => ({ ...m, streaming: false }));
      setStreaming(false);
      abortRef.current = null;
      void queryClient.invalidateQueries({ queryKey: orpc.ai.assistant.conversations.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.ai.credits.key() });
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-5.5rem)] w-full max-w-6xl gap-4 sm:h-[calc(100dvh-8rem)]">
      <aside className="hidden w-60 shrink-0 flex-col gap-2 lg:flex">
        <Button
          variant="outline"
          onClick={() => {
            abortRef.current?.abort();
            setConversationId(undefined);
            setMessages([]);
          }}
        >
          <MessageSquarePlus />
          {t("assistant.new", "New chat")}
        </Button>
        <div className="flex-1 overflow-y-auto">
          {conversations.isError ? (
            <ErrorState error={conversations.error} compact />
          ) : (
            conversations.data?.items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void openConversation(c.id)}
                className={cn(
                  "block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  c.id === conversationId && "bg-accent",
                )}
              >
                <span className="block truncate">{c.title}</span>
                <RelativeTime value={c.updatedAt} className="text-xs text-muted-foreground" />
              </button>
            ))
          )}
        </div>
        {credits.data && (
          <p className="text-xs text-muted-foreground">
            {t("assistant.credits", "{{n}} AI credits left", { n: credits.data.remaining })}
          </p>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-card">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="size-6" />
              </span>
              <div>
                <h1 className="text-lg font-semibold">
                  {t("assistant.title", "Ask about your shop")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "assistant.subtitle",
                    "Answers come from your own orders, costs and stock. Read-only; buyer details never leave InvAI.",
                  )}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void ask(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="flex flex-col gap-4" aria-live="polite">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      m.role === "user" ? "bg-muted" : "bg-primary/10 text-primary",
                    )}
                  >
                    {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                  </span>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50",
                    )}
                  >
                    {(m.tools.length > 0 || m.mock) && (
                      <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {m.tools.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Wrench className="size-3" />
                            {m.tools.join(" · ")}
                          </span>
                        )}
                        {m.mock && <SampleDataBadge />}
                      </p>
                    )}
                    {m.role === "user" ? (
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    ) : (
                      <AssistantAnswer text={m.text} />
                    )}
                    {m.streaming && !m.text && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                    {m.error && <p className="mt-1 text-xs text-danger">{m.error}</p>}
                    {m.recommendationIds && m.recommendationIds.length > 0 && (
                      <div className="mt-2 flex flex-col gap-2">
                        {m.recommendationIds.map((id) => {
                          const rec = recommendationsById[id];
                          return rec ? (
                            <RecommendationCard
                              key={id}
                              rec={rec}
                              onVoted={(updated) =>
                                setRecommendationsById((prev) => ({ ...prev, [id]: updated }))
                              }
                            />
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                </li>
              ))}
              <div ref={bottomRef} />
            </ol>
          )}
        </div>
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={t("assistant.placeholder", "Ask about profit, orders, stock…")}
            className="max-h-40 min-h-10 resize-none"
            aria-label={t("assistant.placeholder", "Ask about profit, orders, stock…")}
          />
          {streaming ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => abortRef.current?.abort()}
              aria-label={t("assistant.stop", "Stop")}
            >
              <Square />
            </Button>
          ) : (
            // Not disabled by an empty textarea: `ask()` already no-ops on a blank message, and
            // QA's e2e (`e2e/market.spec.ts`, `askStarter`) polls this exact button for "streaming
            // finished" after a starter click, which never fills the textarea.
            <Button type="submit" size="icon" aria-label={t("assistant.send", "Send")}>
              <Send />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
