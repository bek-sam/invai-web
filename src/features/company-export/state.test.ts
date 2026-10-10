import { describe, expect, it } from "vitest";
import {
  exportFileKey,
  exportRefetchInterval,
  exportStorageKey,
  exportView,
  inProgressJobId,
  readStoredExportId,
  writeStoredExportId,
} from "./state";

const job = (over: Partial<Parameters<typeof exportView>[0] & object>) => ({
  status: "done" as const,
  resultIds: ["f1"],
  message: null as string | null,
  ...over,
});

describe("exportView", () => {
  it("covers every state", () => {
    expect(exportView(undefined)).toBe("none");
    expect(exportView(job({ status: "queued", resultIds: [] }))).toBe("running");
    expect(exportView(job({ status: "running", resultIds: [] }))).toBe("running");
    expect(exportView(job({ status: "failed", resultIds: [] }))).toBe("failed");
    expect(exportView(job({}))).toBe("ready");
  });
  it("treats done with no result ids, or message expired, as expired", () => {
    expect(exportView(job({ resultIds: [] }))).toBe("expired");
    expect(exportView(job({ message: "expired" }))).toBe("expired");
  });
});

describe("exportRefetchInterval", () => {
  it("polls every 3 s only while queued or running and not failing", () => {
    expect(exportRefetchInterval({ status: "queued" }, false)).toBe(3000);
    expect(exportRefetchInterval({ status: "running" }, false)).toBe(3000);
    expect(exportRefetchInterval({ status: "done" }, false)).toBe(false);
    expect(exportRefetchInterval({ status: "failed" }, false)).toBe(false);
    expect(exportRefetchInterval({ status: "running" }, true)).toBe(false);
    expect(exportRefetchInterval(undefined, false)).toBe(false);
  });
});

describe("stored export id", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  it("is keyed per company", () => {
    const s = mem();
    expect(exportStorageKey("c1")).toBe("invai:export:c1");
    writeStoredExportId("c1", "j1", s);
    expect(s.m.get("invai:export:c1")).toBe("j1");
    expect(readStoredExportId("c1", s)).toBe("j1");
    expect(readStoredExportId("c2", s)).toBeNull();
  });
  it("drops the id on null", () => {
    const s = mem();
    writeStoredExportId("c1", "j1", s);
    writeStoredExportId("c1", null, s);
    expect(readStoredExportId("c1", s)).toBeNull();
  });
  it("survives blocked storage", () => {
    const boom = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredExportId("c1", boom)).toBeNull();
    expect(() => writeStoredExportId("c1", "j1", boom)).not.toThrow();
    expect(readStoredExportId("c1", null)).toBeNull();
  });
});

describe("inProgressJobId", () => {
  it("reads data.jobId only for EXPORT_IN_PROGRESS", () => {
    const data = { jobId: "j9", startedAt: "2026-10-10T00:00:00Z" };
    expect(inProgressJobId({ code: "EXPORT_IN_PROGRESS", data })).toBe("j9");
    expect(inProgressJobId({ code: "CONFLICT", data })).toBeNull();
    expect(inProgressJobId({ code: "EXPORT_IN_PROGRESS", data: {} })).toBeNull();
    expect(inProgressJobId(null)).toBeNull();
  });
});

describe("exportFileKey", () => {
  it("matches the backend key", () => {
    expect(exportFileKey("c1", "f1")).toBe("c1/tenant-export/f1.zip");
  });
});
