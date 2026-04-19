import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom does not implement window.matchMedia; sonner/next-themes calls it on mount.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
  const fakeUuid = (): `${string}-${string}-${string}-${string}-${string}` => {
    const rand = (n: number) =>
      Math.random()
        .toString(16)
        .slice(2, 2 + n)
        .padEnd(n, "0");
    return `${rand(8)}-${rand(4)}-${rand(4)}-${rand(4)}-${rand(12)}` as `${string}-${string}-${string}-${string}-${string}`;
  };
  globalThis.crypto = {
    ...(globalThis.crypto ?? ({} as Crypto)),
    randomUUID: fakeUuid,
  } as Crypto;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
