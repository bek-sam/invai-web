import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/production/sheets/$sheetId")({
  component: () => null,
});
