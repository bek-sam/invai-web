import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/gang-sheets")({
  component: () => (
    <section>
      <h1 className="text-2xl font-semibold">Gang sheets</h1>
      <p className="text-sm opacity-70">
        Build sheets from due orders; OpenSeadragon viewer for previews.
      </p>
    </section>
  ),
});
