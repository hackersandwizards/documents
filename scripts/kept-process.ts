import type { ChildProcess } from "node:child_process";

export const STOP_MS = 2_000;

function stopChild(child: ChildProcess, cleanup?: () => void) {
  child.kill();
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    cleanup?.();
    return;
  }
  // A child stuck on SIGTERM is killed outright. A caller exiting meanwhile still cleans up.
  const force = setTimeout(() => child.kill("SIGKILL"), STOP_MS);
  const onExit = () => cleanup?.();
  process.once("exit", onExit);
  child.ref();
  child.once("exit", () => {
    clearTimeout(force);
    process.off("exit", onExit);
    cleanup?.();
  });
}

/**
 * A child process kept for the next call: started on first use, holding the caller open only while
 * a call is in flight, stopped after a minute idle and when the caller exits. On globalThis, so a
 * dev server re-evaluating this module finds the running one instead of starting another.
 */
const IDLE_MS = 60_000;
type Kept<T> = { api: T; busy(delta: number): void };
export function kept<T>(
  key: string,
  start: (stop: () => void) => { child: ChildProcess; api: T; cleanup?: () => void },
): Kept<T> {
  const store = ((globalThis as Record<symbol, Map<string, Kept<unknown>>>)[
    Symbol.for("@hackersandwizards/documents/kept")
  ] ??= new Map());
  const found = store.get(key) as Kept<T> | undefined;
  if (found) return found;
  let inFlight = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  // Chrome writes its profile while it shuts down, so the cleanup waits for the exit: removed at
  // once, a profile was left behind in 1 of 10 runs (measured). The caller's `exit`
  // cannot wait, so `beforeExit` stops the child first and holds the caller until it is gone;
  // `exit` remains for a caller ending by process.exit.
  const stop = () => {
    if (store.get(key) !== entry) return;
    store.delete(key);
    clearTimeout(idle);
    process.off("beforeExit", stop);
    process.off("exit", atExit);
    stopChild(child, cleanup);
  };
  const { child, api, cleanup } = start(stop);
  const handles = () =>
    [child, ...child.stdio].filter(Boolean) as { ref?(): void; unref?(): void }[];
  child.on("exit", stop);
  // A child that never started emits only `error`.
  child.on("error", stop);
  const atExit = () => {
    stop();
    cleanup?.();
  };
  process.on("beforeExit", stop);
  process.on("exit", atExit);
  const entry: Kept<T> = {
    api,
    busy(delta) {
      if (store.get(key) !== entry) return;
      inFlight += delta;
      clearTimeout(idle);
      for (const h of handles()) (inFlight > 0 ? h.ref : h.unref)?.call(h);
      if (inFlight === 0) (idle = setTimeout(stop, IDLE_MS)).unref?.();
    },
  };
  store.set(key, entry);
  entry.busy(0);
  return entry;
}
