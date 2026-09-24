import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics")({
  component: () => (
    <section>
      <h1 className="text-2xl font-semibold">Profit</h1>
      <p className="text-sm opacity-70">Profit per order, design, blank and channel.</p>
    </section>
  ),
});
