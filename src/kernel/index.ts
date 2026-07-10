import type { Kernel, Module } from "./types";

class KernelImpl implements Kernel {
  private modules = new Map<string, Module>();
  private services = new Map<string, unknown>();

  register(mod: Module): void {
    this.modules.set(mod.name, mod);
  }

  provide<T>(token: string, value: T): void {
    this.services.set(token, value);
  }

  get<T>(token: string): T {
    const service = this.services.get(token);
    if (service === undefined) throw new Error(`Service "${token}" not registered`);
    return service as T;
  }

  async start(): Promise<void> {
    for (const mod of this.modules.values()) {
      await mod.init(this);
      if (mod.start) await mod.start();
    }
  }

  async stop(): Promise<void> {
    const mods = [...this.modules.values()].reverse();
    for (const mod of mods) {
      if (mod.stop) await mod.stop();
    }
  }
}

export function createKernel(): Kernel {
  return new KernelImpl();
}

export type { Kernel, Module };
