import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimitForTest } from "./rate-limit";

beforeEach(() => {
  resetRateLimitForTest();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-18T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows first request", () => {
    expect(checkRateLimit("1.2.3.4")).toEqual({ ok: true });
  });

  it("allows up to max (default 5) requests in one window", () => {
    for (let i = 1; i <= 5; i++) {
      expect(checkRateLimit("1.2.3.4")).toEqual({ ok: true });
    }
  });

  it("blocks the 6th request with retryAfter in seconds", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("1.2.3.4");
    const result = checkRateLimit("1.2.3.4");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfter).toBeGreaterThanOrEqual(1);
      expect(result.retryAfter).toBeLessThanOrEqual(60);
    }
  });

  it("resets after the 60s window passes", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("1.2.3.4");
    expect(checkRateLimit("1.2.3.4").ok).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit("1.2.3.4")).toEqual({ ok: true });
  });

  it("isolates counters per IP", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("1.2.3.4");
    expect(checkRateLimit("5.6.7.8")).toEqual({ ok: true });
  });

  it("isolates counters per bucket (fipe vs negotiate)", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("1.2.3.4", { bucket: "fipe", max: 5 });
    expect(checkRateLimit("1.2.3.4", { bucket: "fipe", max: 5 }).ok).toBe(false);
    expect(checkRateLimit("1.2.3.4", { bucket: "negotiate", max: 5 })).toEqual({ ok: true });
  });

  it("respects custom max option (20 allowed, 21st blocked)", () => {
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit("1.2.3.4", { max: 20 })).toEqual({ ok: true });
    }
    const blocked = checkRateLimit("1.2.3.4", { max: 20 });
    expect(blocked.ok).toBe(false);
  });

  it("respects custom windowMs option", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("1.2.3.4", { windowMs: 10_000 });
    expect(checkRateLimit("1.2.3.4", { windowMs: 10_000 }).ok).toBe(false);
    vi.advanceTimersByTime(10_001);
    expect(checkRateLimit("1.2.3.4", { windowMs: 10_000 })).toEqual({ ok: true });
  });

  it("retryAfter decreases as the window ages", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("1.2.3.4");
    const first = checkRateLimit("1.2.3.4");
    vi.advanceTimersByTime(30_000);
    const second = checkRateLimit("1.2.3.4");
    if (first.ok || second.ok) throw new Error("both should be blocked");
    expect(second.retryAfter).toBeLessThan(first.retryAfter);
  });
});
