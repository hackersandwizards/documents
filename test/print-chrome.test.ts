import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { rejection } from "@hackersandwizards/scaffolding/rejection";
import { assert, expect, test, vi } from "vitest";
import { coldPrint } from "../scripts/print-chrome";
import { readProtocol } from "../scripts/process-protocol";

vi.mock("node:child_process", { spy: true });

const job = { url: "about:blank", timeoutMs: 2_000 };
const pdf = Buffer.from("%PDF-1.7");
const targetMissing = { code: -32602, message: "No target with given id found" };
const closeFailed = { code: -32602, message: "Invalid close parameters" };
const printFailed = { code: -32000, message: "Printing failed" };

function chromeReplies(close: { error: object } | "exit", print: object) {
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
      send({ id, ...replies.get(method) });
      return true;
    }),
  );
  vi.mocked(spawn).mockReturnValueOnce(
    Object.assign(child, {
      stdio: [null, null, null, input, output],
      kill: () => child.emit("exit"),
    }) as ChildProcess,
  );
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

test("reports both failures when printing and closing the target fail", async () => {
  chromeReplies({ error: closeFailed }, { error: printFailed });
  const failure = await coldPrint("chrome", job).then(
    () => undefined,
    (error: unknown) => error,
  );
  assert(failure instanceof AggregateError, "Expected both the print and cleanup errors");
  expect(failure.errors).toEqual([new Error(printFailed.message), new Error(closeFailed.message)]);
});
