import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/production")({
  component: () => (
    <section>
      <h1 className="text-2xl font-semibold">Production</h1>
      <p className="text-sm opacity-70">Station throughput, reprints and capacity for today.</p>
    </section>
  ),
});
