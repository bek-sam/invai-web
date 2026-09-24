import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  component: () => (
    <section>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm opacity-70">
        Company, staff and roles, channel connections, vendors, printers.
      </p>
    </section>
  ),
});
