import type { ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { readProtocol } from "./process-protocol";
import { isRecord } from "./root";

type Result = Record<string, unknown>;
type Pending = { resolve(r: Result): void; reject(e: Error): void; sessionId?: string };
type PendingLoad = (error?: Error) => void;

class ChromeExitedError extends Error {}
class ChromeTargetClosedError extends Error {}

export class ChromePipe {
  readonly exited: Promise<void>;
  private readonly loads = new Map<string, PendingLoad>();
  private readonly input: Writable | undefined;
  private readonly calls = new Map<number, Pending>();
  private id = 0;
  private failure: Error | undefined;

  constructor(child: ChildProcess, hung?: () => void) {
    // Both pipes are missing when Chrome did not start; its error rejects the pending calls.
    this.input = child.stdio[3] as Writable | undefined;
    const output = child.stdio[4] as Readable | undefined;
    output?.setEncoding("utf8");
    output?.on(
      "data",
      readProtocol("\0", (message) => {
        if (this.failure) return false;
        if (!message) {
          this.fail(new Error("Invalid Chrome protocol message"));
          hung?.();
          return false;
        }
        if (typeof message.id === "number") this.receiveReply(message.id, message);
        else if (message.method === "Page.loadEventFired" && typeof message.sessionId === "string")
          this.takeLoad(message.sessionId)?.();
        return true;
      }),
    );
    this.exited = new Promise<void>((resolve) => {
      child.on("exit", () => {
        this.fail(new ChromeExitedError("Chrome exited"));
        resolve();
      });
      child.on("error", (error) => {
        this.fail(error);
        resolve();
      });
    });
    // A write after exit fails with EPIPE, but exit already rejects the calls.
    this.input?.on("error", () => {});
  }

  private receiveReply(id: number, { error, result }: Result) {
    const call = this.calls.get(id);
    if (!call) return;
    this.calls.delete(id);
    if (isRecord(error) && typeof error.message === "string") {
      if (error.code === -32602 && error.message === "No target with given id found")
        call.reject(new ChromeTargetClosedError(error.message));
      else call.reject(new Error(error.message));
    } else if (!error && isRecord(result)) call.resolve(result);
    else call.reject(new Error("Invalid Chrome protocol response"));
  }

  private fail(error: Error) {
    this.failure ??= error;
    for (const call of this.calls.values()) call.reject(error);
    for (const load of this.loads.values()) load(error);
    this.calls.clear();
    this.loads.clear();
  }

  send(method: string, params: object, sessionId?: string): Promise<Result> {
    return new Promise((resolve, reject) => {
      if (this.failure) return reject(this.failure);
      const id = ++this.id;
      this.calls.set(id, { resolve, reject, sessionId });
      this.input?.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });
  }

  async closeTarget(targetId: string): Promise<void> {
    try {
      await this.send("Target.closeTarget", { targetId });
    } catch (error) {
      if (!(error instanceof ChromeExitedError) && !(error instanceof ChromeTargetClosedError))
        throw error;
    }
  }

  async navigate(url: string, sessionId: string): Promise<unknown> {
    // Chrome may finish or lose the load before replying to Page.navigate.
    const loaded = new Promise<Error | undefined>((resolve) => {
      this.loads.set(sessionId, resolve);
    });
    try {
      const { errorText } = await this.send("Page.navigate", { url }, sessionId);
      if (errorText) {
        this.takeLoad(sessionId);
        return errorText;
      }
      const loadError = await loaded;
      if (loadError) throw loadError;
      return undefined;
    } catch (error) {
      this.takeLoad(sessionId);
      throw error;
    }
  }

  private takeLoad(sessionId: string) {
    const load = this.loads.get(sessionId);
    this.loads.delete(sessionId);
    return load;
  }

  rejectSession(sessionId: string, error: Error) {
    for (const [key, call] of this.calls) {
      if (call.sessionId !== sessionId) continue;
      this.calls.delete(key);
      call.reject(error);
    }
    if (sessionId) this.takeLoad(sessionId)?.(error);
  }
}
