import { Toaster } from "@invai/ui";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useTheme } from "../lib/theme";

function Root() {
  const theme = useTheme();
  return (
    <>
      <Outlet />
      <Toaster position="bottom-right" theme={theme} richColors closeButton />
    </>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
});
