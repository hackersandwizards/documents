import type { ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { readProtocol } from "./process-protocol";
import { isRecord } from "./root";

type Result = Record<string, unknown>;
type Pending = { resolve(r: Result): void; reject(e: Error): void; sessionId?: string };
type PendingLoad = { resolve(): void; reject(error: unknown): void };

export class ChromePipe {
  readonly exited: Promise<void>;
  private readonly loads = new Map<string, PendingLoad>();
  private readonly input: Writable | undefined;
  private readonly calls = new Map<number, Pending>();
  private id = 0;
  private gone = false;

  constructor(child: ChildProcess, hung?: () => void) {
    // Both pipes are missing when Chrome did not start; its error rejects the pending calls.
    this.input = child.stdio[3] as Writable | undefined;
    const output = child.stdio[4] as Readable | undefined;
    output?.setEncoding("utf8");
    output?.on(
      "data",
      readProtocol("\0", (message) => {
        if (this.gone) return false;
        if (!message) {
          this.fail(new Error("Invalid Chrome protocol message"));
          hung?.();
          return false;
        }
        if (typeof message.id === "number") this.receiveReply(message.id, message);
        else if (message.method === "Page.loadEventFired" && typeof message.sessionId === "string")
          this.takeLoad(message.sessionId)?.resolve();
        return true;
      }),
    );
    this.exited = new Promise<void>((resolve) => {
      child.on("exit", () => {
        this.fail(new Error("Chrome exited"));
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
    if (isRecord(error) && typeof error.message === "string") call.reject(new Error(error.message));
    else if (!error && isRecord(result)) call.resolve(result);
    else call.reject(new Error("Invalid Chrome protocol response"));
  }

  private fail(error: Error) {
    this.gone = true;
    for (const call of [...this.calls.values(), ...this.loads.values()]) call.reject(error);
    this.calls.clear();
    this.loads.clear();
  }

  send(method: string, params: object, sessionId?: string): Promise<Result> {
    return new Promise((resolve, reject) => {
      if (this.gone) return reject(new Error("Chrome exited"));
      const id = ++this.id;
      this.calls.set(id, { resolve, reject, sessionId });
      this.input?.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });
  }

  async navigate(url: string, sessionId: string): Promise<unknown> {
    const loaded = new Promise<void>((resolve, reject) => {
      this.loads.set(sessionId, { resolve, reject });
    });
    // A failed navigation skips awaiting the load, which can still reject.
    loaded.catch(() => {});
    try {
      const { errorText } = await this.send("Page.navigate", { url }, sessionId);
      if (errorText) {
        this.takeLoad(sessionId)?.reject(new Error(String(errorText)));
        return errorText;
      }
      await loaded;
      return undefined;
    } catch (error) {
      this.takeLoad(sessionId)?.reject(error);
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
    if (sessionId) this.takeLoad(sessionId)?.reject(error);
  }
}
