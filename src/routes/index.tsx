import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <section>
      <h1 className="text-2xl font-semibold">Today</h1>
      <p className="text-sm opacity-70">
        Orders due today, at-risk shipments, sheets waiting on the vendor, low stock.
      </p>
    </section>
  ),
});
