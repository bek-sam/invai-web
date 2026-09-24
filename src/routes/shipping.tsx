import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/shipping")({
  component: () => (
    <section>
      <h1 className="text-2xl font-semibold">Shipping</h1>
      <p className="text-sm opacity-70">Labels, postage wallet, tracking, returns.</p>
    </section>
  ),
});
