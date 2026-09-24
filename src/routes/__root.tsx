import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";

const NAV = [
  ["/", "Today"],
  ["/orders", "Orders"],
  ["/production", "Production"],
  ["/gang-sheets", "Gang sheets"],
  ["/inventory", "Inventory"],
  ["/listings", "Listings"],
  ["/shipping", "Shipping"],
  ["/analytics", "Profit"],
  ["/assistant", "Assistant"],
  ["/settings", "Settings"],
] as const;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <div className="flex min-h-screen bg-background text-foreground">
      <nav className="w-56 border-r border-input p-4 space-y-1">
        {NAV.map(([to, label]) => (
          <Link key={to} to={to} className="block rounded px-2 py-1 hover:bg-accent">
            {label}
          </Link>
        ))}
      </nav>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  ),
});
