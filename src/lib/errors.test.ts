import { describe, expect, it } from "vitest";
import { errorInfo, isUnauthorized, shouldRetry } from "./errors";

describe("errorInfo", () => {
  it("reads oRPC-style errors", () => {
    const err = Object.assign(new Error("Missing permission"), { code: "FORBIDDEN", status: 403 });
    expect(errorInfo(err)).toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      message: "Missing permission",
    });
  });

  it("turns NOT_IMPLEMENTED into a friendly message", () => {
    const err = Object.assign(new Error("Not implemented"), {
      code: "NOT_IMPLEMENTED",
      status: 501,
    });
    expect(errorInfo(err).message).toMatch(/isn't available yet/);
    expect(shouldRetry(0, err)).toBe(false);
  });

  it("recognizes network failures and auth errors", () => {
    expect(errorInfo(new TypeError("Failed to fetch")).code).toBe("NETWORK");
    expect(isUnauthorized({ code: "UNAUTHORIZED", status: 401, message: "Sign in" })).toBe(true);
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(0, { status: 404, code: "NOT_FOUND", message: "x" })).toBe(false);
  });
});
