import type { Job } from "@invai/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useRealtimeListener } from "../lib/realtime";
import { orpc } from "../lib/rpc";

/**
 * Tracks an async job: SSE `job.progress` updates the cache instantly, and polling every
 * 1.5 s covers a missing or reconnecting event stream. Stops polling once done or failed.
 */
export function useJob(jobId: string | null | undefined) {
  const queryClient = useQueryClient();
  const options = orpc.production.jobs.get.queryOptions({
    input: { id: jobId ?? "" },
    enabled: !!jobId,
    refetchInterval: (q) => {
      const s = (q.state.data as Job | undefined)?.status;
      return s === "done" || s === "failed" ? false : 1500;
    },
  });

  useRealtimeListener(
    useCallback(
      (m) => {
        if (m.name !== "job.progress" || !jobId || m.payload.jobId !== jobId) return;
        queryClient.setQueryData(options.queryKey, (prev: Job | undefined) =>
          prev
            ? {
                ...prev,
                status: (m.payload.status as Job["status"]) ?? prev.status,
                progress:
                  typeof m.payload.progress === "number" ? m.payload.progress : prev.progress,
                message: (m.payload.message as string | null) ?? prev.message,
                resultIds: Array.isArray(m.payload.resultIds)
                  ? (m.payload.resultIds as string[])
                  : prev.resultIds,
              }
            : prev,
        );
      },
      [jobId, queryClient, options.queryKey],
    ),
  );

  return useQuery(options);
}
