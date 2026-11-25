import { execFile, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { promisify } from "node:util";
import { kept } from "./kept-process";
import { readProtocol } from "./process-protocol";
import { ROOT } from "./root";

const execFileAsync = promisify(execFile);

/**
 * A document component composed by `scripts/compose.ts` into a standalone, baked HTML string.
 * A child process, so no Vite server starts inside the caller, which may be the app's own; `cwd`
 * is the Astro project whose compiler it runs.
 */
export async function composeDocument(
  name: string,
  props: Record<string, unknown>,
  cwd = process.cwd(),
): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "hw-compose-"));
  try {
    const input = join(dir, "props.json");
    const output = join(dir, "document.html");
    writeFileSync(input, JSON.stringify(props));
    try {
      await execFileAsync("bun", [join(ROOT, "scripts/compose.ts"), name, input, output], { cwd });
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr;
      throw new Error(`Composing ${name} failed: ${stderr || (error as Error).message}`, {
        cause: error,
      });
    }
    return readFileSync(output, "utf-8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Compose with a process shared by calls in one Astro project. A fresh composer costs about
 * 0.5 s and a kept one a few ms, plus 0.4 to 0.8 s to cut the faces when the page's characters
 * differ from the previous call (measured). The process quits after a minute idle and with the
 * caller.
 */
export async function composeWarmDocument(
  name: string,
  props: Record<string, unknown>,
  cwd = process.cwd(),
): Promise<string> {
  const entry = keptComposer(cwd);
  entry.busy(1);
  try {
    return await entry.api(name, props);
  } catch (error) {
    throw new Error(`Composing ${name} failed: ${(error as Error).message}`, { cause: error });
  } finally {
    entry.busy(-1);
  }
}

function keptComposer(cwd: string) {
  return kept(`compose:${cwd}`, (stop) => {
    const child = spawn("bun", [join(ROOT, "scripts/compose.ts"), "--serve"], {
      cwd,
      stdio: ["pipe", "ignore", "inherit", "pipe"],
    });
    let id = 0;
    const calls = new Map<number, { resolve(html: string): void; reject(e: Error): void }>();
    const fail = (error?: Error) => {
      for (const call of calls.values()) call.reject(error ?? new Error("The composer exited"));
      calls.clear();
    };
    // Missing when bun did not start; its `error` below then rejects every call.
    const output = child.stdio[3] as Readable | undefined;
    output?.setEncoding("utf8");
    output?.on(
      "data",
      readProtocol("\n", (answer) => {
        if (typeof answer?.id !== "number") {
          fail(new Error("Invalid composer protocol message"));
          stop();
          return false;
        }
        const call = calls.get(answer.id);
        if (!call) return true;
        calls.delete(answer.id);
        if (typeof answer.error === "string" && answer.error) call.reject(new Error(answer.error));
        else if (!answer.error && typeof answer.html === "string") call.resolve(answer.html);
        else call.reject(new Error("Invalid composer response"));
        return true;
      }),
    );
    child.on("exit", () => fail());
    child.on("error", fail);
    // A write to a composer that has gone fails with EPIPE; its exit above rejects the call.
    child.stdin?.on("error", () => {});
    const compose = (name: string, props: Record<string, unknown>) =>
      new Promise<string>((resolve, reject) => {
        calls.set(++id, { resolve, reject });
        child.stdin?.write(`${JSON.stringify({ id, name, props })}\n`);
      });
    return { child, api: compose };
  });
}
