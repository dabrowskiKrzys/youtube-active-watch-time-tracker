import { describe, expect, it } from "vitest";
import { isIntervalMessage, isResetMessage } from "../messages";

describe("isIntervalMessage", () => {
  it("accepts a well-formed INTERVAL message", () => {
    expect(isIntervalMessage({ type: "INTERVAL", seconds: 1 })).toBe(true);
    expect(isIntervalMessage({ type: "INTERVAL", seconds: 0 })).toBe(true);
    expect(isIntervalMessage({ type: "INTERVAL", seconds: 12.5 })).toBe(true);
  });

  it("rejects a wrong type", () => {
    expect(isIntervalMessage({ type: "RESET", seconds: 1 })).toBe(false);
    expect(isIntervalMessage({ type: "OTHER", seconds: 1 })).toBe(false);
  });

  it("rejects missing or non-number seconds", () => {
    expect(isIntervalMessage({ type: "INTERVAL" })).toBe(false);
    expect(isIntervalMessage({ type: "INTERVAL", seconds: "1" })).toBe(false);
    expect(isIntervalMessage({ type: "INTERVAL", seconds: null })).toBe(false);
  });

  it("rejects non-finite seconds", () => {
    expect(isIntervalMessage({ type: "INTERVAL", seconds: NaN })).toBe(false);
    expect(isIntervalMessage({ type: "INTERVAL", seconds: Infinity })).toBe(
      false
    );
  });

  it("rejects non-object and nullish inputs", () => {
    expect(isIntervalMessage(null)).toBe(false);
    expect(isIntervalMessage(undefined)).toBe(false);
    expect(isIntervalMessage("INTERVAL")).toBe(false);
    expect(isIntervalMessage(42)).toBe(false);
  });
});

describe("isResetMessage", () => {
  it("accepts a well-formed RESET message", () => {
    expect(isResetMessage({ type: "RESET" })).toBe(true);
  });

  it("ignores extra properties", () => {
    expect(isResetMessage({ type: "RESET", extra: true })).toBe(true);
  });

  it("rejects a wrong type", () => {
    expect(isResetMessage({ type: "INTERVAL", seconds: 1 })).toBe(false);
    expect(isResetMessage({ type: "OTHER" })).toBe(false);
  });

  it("rejects non-object and nullish inputs", () => {
    expect(isResetMessage(null)).toBe(false);
    expect(isResetMessage(undefined)).toBe(false);
    expect(isResetMessage("RESET")).toBe(false);
  });
});

describe("guard mutual exclusivity", () => {
  it("an INTERVAL message is not a RESET message and vice versa", () => {
    const interval = { type: "INTERVAL", seconds: 3 };
    const reset = { type: "RESET" };
    expect(isIntervalMessage(interval)).toBe(true);
    expect(isResetMessage(interval)).toBe(false);
    expect(isResetMessage(reset)).toBe(true);
    expect(isIntervalMessage(reset)).toBe(false);
  });
});
