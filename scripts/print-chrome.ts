import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { chromeArgs } from "@hackersandwizards/scaffolding/chrome";
import { makeChromeProfile } from "./chrome-profile";
import { kept, STOP_MS } from "./kept-process";
import { ChromePipe } from "./chrome-pipe";
import { isRecord } from "./root";
import { stableBytes } from "./stable-pdf";

/** The print settings. Chrome tags the PDF without being asked; the outline needs the flag. */
const PRINT_PARAMS = {
  displayHeaderFooter: false,
  printBackground: true,
  generateDocumentOutline: true,
  generateTaggedPDF: true,
  preferCSSPageSize: true,
};

/**
 * A page whose layout runs after load, such as a measurement once the faces are in, puts the
 * promise of that work on `globalThis.hwLayout`, an array the first such script creates. The print
 * waits for every one, and a layout still pending at the timeout fails the render instead of
 * printing it half done. Chrome's `--print-to-pdf` printed at load, before the handout's
 * `document.fonts.ready` work in 2 of 8 runs (measured), so no render uses it. The
 * faces need no wait: inlined, they printed in 72 of 72 renders, 8 in parallel with every core
 * busy, a face first asked for after load included; a face taking 10 s over HTTP after load
 * printed the fallback, which assertBrandFonts fails (measured).
 */
const LAYOUT = "Promise.all(globalThis.hwLayout ?? []).then(() => true)";

/** The error message for a URL whose server refused the connection, worded like a bad status. */
export const refused = (url: string) => `${url} refused the connection: is its server running?`;

export type PrintJob = { url: string; timeoutMs: number; script?: string };
type Target = { targetId?: string; sessionId?: string };

async function loadPrintPage(pipe: ChromePipe, sessionId: string, job: PrintJob) {
  const { url, script } = job;
  await pipe.send("Page.enable", {}, sessionId);
  if (script)
    await pipe.send("Page.addScriptToEvaluateOnNewDocument", { source: script }, sessionId);
  const errorText = await pipe.navigate(url, sessionId);
  if (errorText) {
    throw new Error(
      errorText === "net::ERR_CONNECTION_REFUSED"
        ? refused(url)
        : `Chrome could not load ${url}: ${String(errorText)}`,
    );
  }
  // Chrome also prints an HTTP error page as if it were the document.
  const { result } = await pipe.send(
    "Runtime.evaluate",
    {
      expression: `performance.getEntriesByType("navigation")[0]?.responseStatus ?? 0`,
      returnByValue: true,
    },
    sessionId,
  );
  if (!isRecord(result) || typeof result.value !== "number")
    throw new Error("Chrome returned no HTTP status");
  if (result.value >= 400) throw new Error(`${url} answered HTTP ${result.value}`);
}

async function printLoadedPage(pipe: ChromePipe, sessionId: string, url: string): Promise<Buffer> {
  const { exceptionDetails } = await pipe.send(
    "Runtime.evaluate",
    { expression: LAYOUT, awaitPromise: true },
    sessionId,
  );
  if (exceptionDetails) {
    if (!isRecord(exceptionDetails) || typeof exceptionDetails.text !== "string")
      throw new Error("Invalid Chrome layout exception");
    const { exception, text } = exceptionDetails;
    const description = isRecord(exception) ? exception.description : undefined;
    throw new Error(
      `The layout of ${url} failed: ${typeof description === "string" ? description : text}`,
    );
  }
  const { data } = await pipe.send("Page.printToPDF", PRINT_PARAMS, sessionId);
  if (typeof data !== "string") throw new Error("Chrome returned no PDF data");
  return stableBytes(Buffer.from(data, "base64"));
}

async function printTarget(pipe: ChromePipe, target: Target, job: PrintJob): Promise<Buffer> {
  const { targetId } = await pipe.send("Target.createTarget", { url: "about:blank" });
  if (typeof targetId !== "string") throw new Error("Chrome returned no target ID");
  target.targetId = targetId;
  let printed: { pdf: Buffer } | { error: unknown };
  let closeFailure: { error: unknown } | undefined;
  try {
    const { sessionId } = await pipe.send("Target.attachToTarget", { targetId, flatten: true });
    if (typeof sessionId !== "string") throw new Error("Chrome returned no session ID");
    target.sessionId = sessionId;
    await loadPrintPage(pipe, sessionId, job);
    printed = { pdf: await printLoadedPage(pipe, sessionId, job.url) };
  } catch (error) {
    printed = { error };
  } finally {
    try {
      await pipe.closeTarget(targetId);
    } catch (error) {
      closeFailure = { error };
    }
  }
  if ("error" in printed) {
    if (closeFailure && printed.error !== closeFailure.error)
      throw new AggregateError(
        [printed.error, closeFailure.error],
        "Printing and closing the Chrome target both failed",
        { cause: printed.error },
      );
    throw printed.error;
  }
  if (closeFailure) throw closeFailure.error;
  return printed.pdf;
}

async function closePrintTarget(pipe: ChromePipe, targetId: string): Promise<boolean | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pipe.closeTarget(targetId).then(
        () => true,
        (error: unknown) => {
          if (
            error instanceof Error &&
            error.message === "Specified target doesn't support closing"
          )
            return false;
          console.error("Closing timed-out Chrome target failed", error);
          return undefined;
        },
      ),
      new Promise<boolean>((resolve) => (timer = setTimeout(resolve, STOP_MS, false))),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Unlike a debugging port, a private pipe (fd 3 in, fd 4 out) is unreachable to other processes.
 * The temporary profile keeps the render from using or locking the user's Chrome profile. */
function pipeChrome(chrome: string, hung?: () => void) {
  const profile = makeChromeProfile();
  const child = spawn(chrome, [...chromeArgs(profile), "--remote-debugging-pipe", "about:blank"], {
    stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
  });
  const pipe = new ChromePipe(child, hung);
  // On timeout, close only this target and reject its calls. A browser that cannot close the
  // target within STOP_MS is hung and must stop.
  const abandon = async ({ targetId, sessionId }: Target, error: Error) => {
    if (sessionId !== undefined) pipe.rejectSession(sessionId, error);
    if (targetId && (await closePrintTarget(pipe, targetId))) return;
    (hung ?? (() => child.kill()))();
  };
  const print = (job: PrintJob): Promise<Buffer> => {
    const target: Target = {};
    return printWithin(printTarget(pipe, target, job), job, (error) => void abandon(target, error));
  };
  return {
    child,
    exited: pipe.exited,
    print,
    cleanup: () => rmSync(profile, { recursive: true, force: true }),
  };
}

async function printWithin(
  print: Promise<Buffer>,
  { url, timeoutMs }: PrintJob,
  stop: (error: Error) => void,
): Promise<Buffer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      print,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(
            `Chrome did not print ${url} within ${timeoutMs} ms: Chrome hung, or a layout on globalThis.hwLayout never finished`,
          );
          stop(error);
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function coldPrint(chrome: string, job: PrintJob): Promise<Buffer> {
  const browser = pipeChrome(chrome);
  try {
    return await browser.print(job);
  } finally {
    browser.child.kill();
    // A Chrome stuck on SIGTERM is killed outright, as the kept one is.
    const force = setTimeout(() => browser.child.kill("SIGKILL"), STOP_MS);
    await browser.exited;
    clearTimeout(force);
    browser.cleanup();
  }
}

export function keptChrome(chrome: string) {
  const entry = kept(`chrome:print-job-v1:${chrome}`, (stop) => {
    const { child, print, cleanup } = pipeChrome(chrome, stop);
    return { child, api: { print }, cleanup };
  });
  return {
    async print(job: PrintJob): Promise<Buffer> {
      entry.busy(1);
      try {
        // A hung Chrome is stopped and replaced on the next call.
        return await entry.api.print(job);
      } finally {
        entry.busy(-1);
      }
    },
  };
}
