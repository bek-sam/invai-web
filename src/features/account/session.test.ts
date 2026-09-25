import { describe, expect, it } from "vitest";
import { describeDevice, toLocale, totpSecret } from "./session";

describe("totpSecret", () => {
  it("reads and groups the secret from an otpauth URI", () => {
    expect(
      totpSecret("otpauth://totp/InvAI:a%40b.test?secret=JBSWY3DPEHPK3PXP&issuer=InvAI&digits=6"),
    ).toBe("JBSW Y3DP EHPK 3PXP");
  });
  it("returns null for anything else", () => {
    expect(totpSecret("not a uri")).toBeNull();
    expect(totpSecret("otpauth://totp/InvAI?issuer=InvAI")).toBeNull();
  });
});

describe("describeDevice", () => {
  it("names common browsers and systems", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      ),
    ).toEqual({ browser: "Chrome", os: "macOS", kind: "computer" });
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ browser: "Safari", os: "iOS", kind: "phone" });
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/130.0")).toEqual({
      browser: "Firefox",
      os: "Windows",
      kind: "computer",
    });
  });
  it("copes with a missing user agent", () => {
    expect(describeDevice(null)).toEqual({ browser: null, os: null, kind: "computer" });
  });
});

describe("toLocale", () => {
  it("only knows en and es", () => {
    expect(toLocale("es")).toBe("es");
    expect(toLocale("fr")).toBe("en");
    expect(toLocale(undefined)).toBe("en");
  });
});
