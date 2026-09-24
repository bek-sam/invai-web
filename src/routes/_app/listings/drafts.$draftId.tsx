import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/listings/drafts/$draftId")({
  component: () => null,
});
