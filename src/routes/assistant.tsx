import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/assistant")({
  component: () => (
    <section>
      <h1 className="text-2xl font-semibold">Assistant</h1>
      <p className="text-sm opacity-70">AI business assistant (AI SDK + assistant-ui).</p>
    </section>
  ),
});
