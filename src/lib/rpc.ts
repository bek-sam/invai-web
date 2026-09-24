import type { Contract } from "@invai/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

const link = new RPCLink({
  url: `${import.meta.env.VITE_API_URL}/rpc`,
  fetch: (req, init) => fetch(req, { ...init, credentials: "include" }),
});

export const client: ContractRouterClient<Contract> = createORPCClient(link);
export const orpc = createTanstackQueryUtils(client);
