import { Link } from "@tanstack/react-router";
import type * as React from "react";

/** A router Link for paths computed at runtime (nav config, alerts), where the typed `to` can't be inferred. */
export function AnyLink({
  to,
  search,
  hash,
  ...props
}: Omit<React.ComponentProps<"a">, "href"> & {
  to: string;
  search?: Record<string, unknown>;
  hash?: string;
}) {
  return <Link to={to as never} search={search as never} hash={hash} {...props} />;
}
