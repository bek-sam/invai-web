import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/listings")({
  component: () => (
    <section>
      <h1 className="text-2xl font-semibold">Listings</h1>
      <p className="text-sm opacity-70">
        AI listing drafts, mockups, trademark check, approval, publishing.
      </p>
    </section>
  ),
});
