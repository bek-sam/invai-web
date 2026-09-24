import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/catalog/designs/$designId")({
  component: () => null,
});
