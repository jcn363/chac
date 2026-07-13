import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const storage = new AsyncLocalStorage<string>();

export function getCorrelationId(): string | undefined {
  return storage.getStore();
}

export function runWithCorrelation<T>(id: string, fn: () => T): T {
  return storage.run(id, fn);
}

export function generateCorrelationId(): string {
  return randomUUID().slice(0, 8);
}
