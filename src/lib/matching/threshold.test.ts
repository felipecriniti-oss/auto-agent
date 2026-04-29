import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MATCH_SCORE_THRESHOLD, getMatchScoreThreshold } from "./threshold";

describe("getMatchScoreThreshold", () => {
  const originalEnv = process.env.MATCH_SCORE_THRESHOLD;

  beforeEach(() => {
    Reflect.deleteProperty(process.env, "MATCH_SCORE_THRESHOLD");
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      Reflect.deleteProperty(process.env, "MATCH_SCORE_THRESHOLD");
    } else {
      process.env.MATCH_SCORE_THRESHOLD = originalEnv;
    }
  });

  it("returns the default 0.7 when env var is unset", () => {
    expect(getMatchScoreThreshold()).toBe(DEFAULT_MATCH_SCORE_THRESHOLD);
    expect(DEFAULT_MATCH_SCORE_THRESHOLD).toBe(0.7);
  });

  it("returns the env-var value when set to a valid number in [0,1]", () => {
    process.env.MATCH_SCORE_THRESHOLD = "0.5";
    expect(getMatchScoreThreshold()).toBe(0.5);
  });

  it("falls back to default when env var is non-numeric", () => {
    process.env.MATCH_SCORE_THRESHOLD = "garbage";
    expect(getMatchScoreThreshold()).toBe(0.7);
  });

  it("falls back to default when env var is below 0", () => {
    process.env.MATCH_SCORE_THRESHOLD = "-0.5";
    expect(getMatchScoreThreshold()).toBe(0.7);
  });

  it("falls back to default when env var is above 1", () => {
    process.env.MATCH_SCORE_THRESHOLD = "1.5";
    expect(getMatchScoreThreshold()).toBe(0.7);
  });

  it("falls back to default when env var is empty string", () => {
    process.env.MATCH_SCORE_THRESHOLD = "";
    expect(getMatchScoreThreshold()).toBe(0.7);
  });
});
