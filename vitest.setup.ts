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

// jsdom does not implement ResizeObserver; cmdk (used by <Command>) observes
// its list container on mount. Without this polyfill, any test that opens a
// shadcn Command/Popover combobox (LocalidadePicker, FipeBrandCombobox,
// FipeModelCombobox) throws "ResizeObserver is not defined".
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}

// jsdom does not implement Element.scrollIntoView; cmdk calls it to keep the
// selected CommandItem visible. Without this stub, combobox tests throw
// "e.scrollIntoView is not a function".
if (
  typeof Element !== "undefined" &&
  typeof (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView !== "function"
) {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
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
