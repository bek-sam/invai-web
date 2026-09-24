import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/inventory")({
  component: () => (
    <section>
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <p className="text-sm opacity-70">
        Blank stock by style, color and size; purchase orders to S&S and SanMar.
      </p>
    </section>
  ),
});
