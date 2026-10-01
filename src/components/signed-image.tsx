import { cn, Skeleton } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { orpc } from "../lib/rpc";

/**
 * Signed URLs live 15 minutes; refresh a bit before that.
 *
 * Gate root-cause §1: `.queryOptions()`'s generated queryFn always reads `context.signal`, so
 * TanStack Query aborts the underlying fetch whenever every component reading this fileKey
 * unmounts mid-request -- e.g. clicking a design card (or any navigation) while its thumbnail is
 * still loading. Nothing here depends on the fetch finishing before navigation, and the image is
 * thrown away either way once unmounted, so call the client directly (no signal): the request
 * completes normally in the background instead of surfacing as a failed/aborted request.
 */
export function useSignedUrl(fileKey: string | null | undefined) {
  const input = { fileKey: fileKey ?? "", disposition: "inline" as const };
  return useQuery({
    queryKey: orpc.files.downloadUrl.queryKey({ input }),
    queryFn: () => orpc.files.downloadUrl.call(input),
    enabled: !!fileKey,
    staleTime: 10 * 60_000,
    gcTime: 14 * 60_000,
    retry: false,
  });
}

/** An image stored in S3 by key. Checkerboard behind it so transparent DTF art is visible. */
export function SignedImage({
  fileKey,
  alt,
  className,
  checker = true,
}: {
  fileKey: string | null | undefined;
  alt: string;
  className?: string;
  checker?: boolean;
}) {
  const q = useSignedUrl(fileKey);
  const base = cn("overflow-hidden rounded-md", checker && "checkerboard", className);
  if (!fileKey || q.isError) {
    return (
      <div
        className={cn(base, "flex items-center justify-center bg-muted text-muted-foreground")}
        title={alt}
      >
        <ImageOff className="size-5" aria-hidden />
      </div>
    );
  }
  if (q.isPending) return <Skeleton className={base} />;
  return (
    <div className={base}>
      <img src={q.data.url} alt={alt} loading="lazy" className="size-full object-contain" />
    </div>
  );
}
