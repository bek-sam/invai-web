import { cn, Skeleton } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { orpc } from "../lib/rpc";

/** Signed URLs live 15 minutes; refresh a bit before that. */
export function useSignedUrl(fileKey: string | null | undefined) {
  return useQuery(
    orpc.files.downloadUrl.queryOptions({
      input: { fileKey: fileKey ?? "", disposition: "inline" },
      enabled: !!fileKey,
      staleTime: 10 * 60_000,
      gcTime: 14 * 60_000,
      retry: false,
    }),
  );
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
