import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/orders")({
  component: () => (
    <section>
      <h1 className="text-2xl font-semibold">Orders</h1>
      <p className="text-sm opacity-70">
        One queue across all channels, sorted by ship-by date. TanStack Table + Virtual.
      </p>
    </section>
  ),
});
