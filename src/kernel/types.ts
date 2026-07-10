export interface Module {
  name: string;
  init(kernel: Kernel): Promise<void>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

export interface Kernel {
  register(module: Module): void;
  get<T>(token: string): T;
  provide<T>(token: string, value: T): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
