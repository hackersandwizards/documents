import type { ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { readProtocol } from "./process-protocol";
import { isRecord } from "./root";

type Result = Record<string, unknown>;
type Pending = { resolve(r: Result): void; reject(e: Error): void; sessionId?: string };

export class ChromePipe {
  readonly exited: Promise<void>;
  readonly loads = new Map<string, Omit<Pending, "sessionId">>();
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
          this.loads.get(message.sessionId)?.resolve({});
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

  loaded(sessionId: string): Promise<Result> {
    return new Promise((resolve, reject) => this.loads.set(sessionId, { resolve, reject }));
  }

  rejectSession(sessionId: string, error: Error) {
    for (const [key, call] of this.calls) {
      if (call.sessionId !== sessionId) continue;
      this.calls.delete(key);
      call.reject(error);
    }
    if (sessionId) this.loads.get(sessionId)?.reject(error);
  }
}
