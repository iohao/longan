import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Node 25 ships a partial Web Storage global that shadows jsdom's working
// implementation (nodejs/node#60303, vitest-dev/vitest#8757); replace both
// storages with a functional in-memory one so behavior matches every runtime.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  };
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, name, {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  });
}

// RTL's automatic cleanup needs a global afterEach, which we don't enable
// (globals: false); register it explicitly instead.
afterEach(cleanup);
