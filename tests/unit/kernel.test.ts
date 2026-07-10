import { describe, it, expect, beforeEach } from "bun:test";
import { createKernel, type Module } from "../../src/kernel";

let kernel: ReturnType<typeof createKernel>;

beforeEach(() => {
  kernel = createKernel();
});

describe("Kernel lifecycle", () => {
  it("register + start initializes modules", async () => {
    const log: string[] = [];
    const mod: Module = {
      name: "test-mod",
      async init() { log.push("init"); },
      async start() { log.push("start"); },
    };
    kernel.register(mod);
    await kernel.start();
    expect(log).toEqual(["init", "start"]);
  });

  it("stop calls stop in reverse order", async () => {
    const log: string[] = [];
    const mod1: Module = {
      name: "mod1",
      async init() {},
      async stop() { log.push("stop-1"); },
    };
    const mod2: Module = {
      name: "mod2",
      async init() {},
      async stop() { log.push("stop-2"); },
    };
    kernel.register(mod1);
    kernel.register(mod2);
    await kernel.stop();
    expect(log).toEqual(["stop-2", "stop-1"]);
  });

  it("skips start/stop when not defined", async () => {
    const mod: Module = {
      name: "no-hooks",
      async init() {},
    };
    kernel.register(mod);
    await kernel.start();
    await kernel.stop();
  });

  it("get throws for unregistered service", () => {
    expect(() => kernel.get("missing")).toThrow('Service "missing" not registered');
  });
});
