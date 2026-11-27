import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { rejection } from "@hackersandwizards/scaffolding/rejection";
import { assert, expect, test, vi } from "vitest";
import { ChromeExitedError } from "../scripts/chrome-pipe";
import { coldPrint, keptChrome } from "../scripts/print-chrome";
import { readProtocol } from "../scripts/process-protocol";

vi.mock("node:child_process", { spy: true });

const job = { url: "about:blank", timeoutMs: 2_000 };
const pdf = Buffer.from("%PDF-1.7");
const targetMissing = { code: -32602, message: "No target with given id found" };
const closeFailed = { code: -32602, message: "Invalid close parameters" };
const printFailed = { code: -32000, message: "Printing failed" };

function chromeReplies(close: { error: object } | "exit", print?: object) {
  const child = new EventEmitter();
  const input = new PassThrough();
  const output = new PassThrough();
  const replies = new Map([
    ["Target.createTarget", { result: { targetId: "target" } }],
    ["Target.attachToTarget", { result: { sessionId: "session" } }],
    ["Page.enable", { result: {} }],
    ["Page.navigate", { result: {} }],
    ["Runtime.evaluate", { result: { result: { value: 200 } } }],
    ["Page.printToPDF", print],
  ]);
  const send = (message: object) => output.write(JSON.stringify(message) + "\0");
  input.on(
    "data",
    readProtocol("\0", (request) => {
      if (typeof request?.method !== "string") throw new Error("Expected a Chrome command");
      const { id, method } = request;
      if (method === "Target.closeTarget") {
        if (close === "exit") child.emit("exit");
        else send({ id, ...close });
        return true;
      }
      if (method === "Page.navigate")
        send({ method: "Page.loadEventFired", sessionId: request.sessionId });
      if (method === "Page.printToPDF" && print === undefined) return true;
      send({ id, ...replies.get(method) });
      return true;
    }),
  );
  const kill = vi.fn(() => child.emit("exit"));
  vi.mocked(spawn).mockReturnValueOnce(
    Object.assign(child, {
      stdio: [null, null, null, input, output],
      kill: () => kill(),
    }) as ChildProcess,
  );
  return { input, output, kill };
}

const printed = { result: { data: pdf.toString("base64") } };

test.each([
  { reason: "the target was already closed", reply: { error: targetMissing } },
  { reason: "Chrome exited", reply: "exit" as const },
])("keeps the PDF when cleanup reports that $reason", async ({ reply }) => {
  chromeReplies(reply, printed);
  expect(await coldPrint("chrome", job)).toEqual(pdf);
});

test("propagates an unexpected failure to close the printed target", async () => {
  chromeReplies({ error: closeFailed }, printed);
  expect(await rejection(coldPrint("chrome", job))).toBe(`Error: ${closeFailed.message}`);
});

test("logs an unexpected close error before stopping a timed-out kept Chrome", async () => {
  const { kill } = chromeReplies({ error: closeFailed });
  const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const chrome = keptChrome("timed-out-test-chrome");
    expect(await rejection(chrome.print({ ...job, timeoutMs: 10 }))).toContain("did not print");
    await vi.waitFor(() => expect(kill).toHaveBeenCalledTimes(1));
    expect(stderr).toHaveBeenCalledWith(
      "Closing timed-out Chrome target failed",
      new Error(closeFailed.message),
    );
    expect(stderr).toHaveBeenCalledBefore(kill);
  } finally {
    stderr.mockRestore();
  }
});

test("ignores EPIPE on the input, leaving the exit to reject the print", async () => {
  const { input, kill } = chromeReplies({ error: targetMissing });
  const pending = keptChrome("epipe-test-chrome")
    .print(job)
    .then(
      () => undefined,
      (error: unknown) => error,
    );
  await vi.waitFor(() => expect(input.listenerCount("error")).toBeGreaterThan(0));
  input.emit("error", Object.assign(new Error("Pipe closed"), { code: "EPIPE" }));
  expect(kill).not.toHaveBeenCalled();
  kill(); // emits exit
  expect(await pending).toBeInstanceOf(ChromeExitedError);
});

test.each(["input", "output"] as const)(
  "%s pipe I/O failure rejects a pending print",
  async (side) => {
    const streams = chromeReplies({ error: targetMissing });
    const stream = streams[side];
    const pending = keptChrome(`pipe-error-${side}-chrome`)
      .print(job)
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    const failure = Object.assign(new Error("Pipe I/O failed"), { code: "EIO" });
    expect(() => stream.emit("error", failure)).not.toThrow();
    expect(await pending).toBe(failure);
    expect(streams.kill).toHaveBeenCalledTimes(1);
  },
);

test("starts a new Chrome despite an entry under the legacy cache key", async () => {
  const chrome = "old-shape-test-chrome";
  const store = ((globalThis as Record<symbol, Map<string, unknown>>)[
    Symbol.for("@hackersandwizards/documents/kept")
  ] ??= new Map());
  store.set(chrome, { api: { print: () => Buffer.from("legacy") }, busy() {} });
  try {
    const { kill } = chromeReplies("exit", printed);
    expect(await keptChrome(chrome).print(job)).toEqual(pdf);
    expect(kill).toHaveBeenCalledTimes(1);
  } finally {
    store.delete(chrome);
    vi.mocked(spawn).mockReset();
  }
});

test("reports both failures when printing and closing the target fail", async () => {
  chromeReplies({ error: closeFailed }, { error: printFailed });
  const failure = await coldPrint("chrome", job).then(
    () => undefined,
    (error: unknown) => error,
  );
  assert(failure instanceof AggregateError, "Expected both the print and cleanup errors");
  expect(failure.errors).toEqual([new Error(printFailed.message), new Error(closeFailed.message)]);
});
