import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isNegotiationEnabled } from "./kill-switch";

const ORIGINAL = process.env.NEGOTIATION_ENABLED;

beforeEach(() => {
  // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset
  delete process.env.NEGOTIATION_ENABLED;
});

afterEach(() => {
  if (ORIGINAL === undefined) {
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset
    delete process.env.NEGOTIATION_ENABLED;
  } else {
    process.env.NEGOTIATION_ENABLED = ORIGINAL;
  }
});

describe("isNegotiationEnabled", () => {
  it("returns true when env var is undefined (dev default)", () => {
    expect(isNegotiationEnabled()).toBe(true);
  });

  it("returns true when env var is 'true'", () => {
    process.env.NEGOTIATION_ENABLED = "true";
    expect(isNegotiationEnabled()).toBe(true);
  });

  it("returns false when env var is exactly 'false'", () => {
    process.env.NEGOTIATION_ENABLED = "false";
    expect(isNegotiationEnabled()).toBe(false);
  });

  it("returns true when env var is 'FALSE' (case-sensitive per D-17)", () => {
    process.env.NEGOTIATION_ENABLED = "FALSE";
    expect(isNegotiationEnabled()).toBe(true);
  });

  it("returns true when env var is empty string", () => {
    process.env.NEGOTIATION_ENABLED = "";
    expect(isNegotiationEnabled()).toBe(true);
  });

  it("returns true when env var is '0'", () => {
    process.env.NEGOTIATION_ENABLED = "0";
    expect(isNegotiationEnabled()).toBe(true);
  });

  it("returns true when env var is 'disabled'", () => {
    process.env.NEGOTIATION_ENABLED = "disabled";
    expect(isNegotiationEnabled()).toBe(true);
  });
});
