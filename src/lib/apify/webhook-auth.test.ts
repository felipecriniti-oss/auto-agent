import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyHmacSha256, verifySharedSecret } from "./webhook-auth";

describe("verifySharedSecret", () => {
  it("returns false when header is null", () => {
    expect(verifySharedSecret(null, "expected")).toBe(false);
  });

  it("returns false when header is undefined", () => {
    expect(verifySharedSecret(undefined, "expected")).toBe(false);
  });

  it("returns false when header is empty string", () => {
    expect(verifySharedSecret("", "expected")).toBe(false);
  });

  it("returns false when expected is empty (length mismatch)", () => {
    expect(verifySharedSecret("abc", "")).toBe(false);
  });

  it("returns true when header equals expected", () => {
    expect(verifySharedSecret("abc-123-xyz", "abc-123-xyz")).toBe(true);
  });

  it("returns false when same length but different content", () => {
    expect(verifySharedSecret("abc", "abd")).toBe(false);
  });

  it("returns false when lengths differ (no throw)", () => {
    expect(() => verifySharedSecret("ab", "abc")).not.toThrow();
    expect(verifySharedSecret("ab", "abc")).toBe(false);
  });

  it("returns false when header is much longer than expected (no throw)", () => {
    expect(() => verifySharedSecret("a".repeat(200), "abc")).not.toThrow();
    expect(verifySharedSecret("a".repeat(200), "abc")).toBe(false);
  });
});

describe("verifyHmacSha256", () => {
  const secret = "phase-8-test-secret";
  const body = '{"event":"ACTOR.RUN.SUCCEEDED"}';
  const correctHex = createHmac("sha256", secret).update(body).digest("hex");

  it("returns false when header is null", () => {
    expect(verifyHmacSha256(body, null, secret)).toBe(false);
  });

  it("returns false when header is undefined", () => {
    expect(verifyHmacSha256(body, undefined, secret)).toBe(false);
  });

  it("returns false when header is empty", () => {
    expect(verifyHmacSha256(body, "", secret)).toBe(false);
  });

  it("returns true when header is the correct sha256 hex", () => {
    expect(verifyHmacSha256(body, correctHex, secret)).toBe(true);
  });

  it("returns false when header is a wrong sha256 hex of same length", () => {
    const wrongHex = correctHex.replace(/^./, correctHex[0] === "a" ? "b" : "a");
    expect(verifyHmacSha256(body, wrongHex, secret)).toBe(false);
  });

  it("returns false when header is too short (no throw)", () => {
    expect(() => verifyHmacSha256(body, "deadbeef", secret)).not.toThrow();
    expect(verifyHmacSha256(body, "deadbeef", secret)).toBe(false);
  });

  it("returns false when secret differs", () => {
    expect(verifyHmacSha256(body, correctHex, "wrong-secret")).toBe(false);
  });

  it("returns false when body differs", () => {
    expect(verifyHmacSha256("different body", correctHex, secret)).toBe(false);
  });
});
