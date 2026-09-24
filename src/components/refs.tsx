import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/rpc";
import { blankLabel } from "./pickers";

/** Resolves a design id to its code + name (cached). */
export function DesignRef({ id }: { id: string | null }) {
  const q = useQuery(
    orpc.designs.get.queryOptions({
      input: { id: id ?? "" },
      enabled: !!id,
      staleTime: 5 * 60_000,
    }),
  );
  if (!id) return <span className="text-muted-foreground">—</span>;
  if (!q.data) return <span className="text-muted-foreground">…</span>;
  return (
    <span>
      <span className="font-mono text-xs text-muted-foreground">{q.data.code}</span> {q.data.name}
    </span>
  );
}

/** Resolves a blank variant id to "Brand Style · Color · Size" (cached). */
export function BlankRef({ id }: { id: string | null }) {
  const q = useQuery(
    orpc.blanks.get.queryOptions({ input: { id: id ?? "" }, enabled: !!id, staleTime: 5 * 60_000 }),
  );
  if (!id) return <span className="text-muted-foreground">—</span>;
  if (!q.data) return <span className="text-muted-foreground">…</span>;
  return <span>{blankLabel(q.data)}</span>;
}
