export interface ScheduledTask {
  name: string;
  intervalMs: number;
  fn: () => Promise<void>;
  lastRun: number;
  running: boolean;
}

export interface TaskStatus {
  name: string;
  intervalMs: number;
  lastRun: number | null;
  running: boolean;
  nextRun: number;
}
