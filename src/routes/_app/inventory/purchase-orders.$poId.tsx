import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/inventory/purchase-orders/$poId")({
  component: () => null,
});
