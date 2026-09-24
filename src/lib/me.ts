import type { Me, Permission } from "@invai/contracts";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "./rpc";

export const meQueryOptions = () => orpc.me.get.queryOptions({ input: {}, staleTime: 60_000 });

/** The signed-in user; only used under the authenticated layout, where `me` is preloaded. */
export function useMe(): Me {
  const { data } = useQuery(meQueryOptions());
  if (!data) throw new Error("useMe() used outside the authenticated layout");
  return data;
}

export function useCan() {
  const me = useMe();
  return (permission: Permission) => me.permissions.includes(permission);
}

export function isVendorOrg(me: Pick<Me, "org">): boolean {
  return me.org.type === "vendor";
}
