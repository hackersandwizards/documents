import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { rejection } from "@hackersandwizards/scaffolding/rejection";
import { ChromeExitedError } from "../scripts/chrome-pipe";
import { renderPdf } from "../scripts/render-pdf";
import { onepagerTrials, widestOnepagerSpacing } from "../scripts/onepager-trials";

vi.mock("../scripts/render-pdf");

let root: string;
let trial: ReturnType<typeof onepagerTrials>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "onepager-trials-test-"));
  trial = onepagerTrials((fit) => Promise.resolve(JSON.stringify(fit)), root);
});

afterEach(() => {
  trial.close();
  rmSync(root, { recursive: true, force: true });
});

test("reuses the HTML path and keeps the baked content for the same fit", async () => {
  const fit = { tight: true };
  const first = await trial.files(fit);
  const second = await trial.files(fit);
  expect(second.html).toBe(first.html);
  expect(readFileSync(second.html, "utf8")).toBe(JSON.stringify(fit));
});

test("writes a different fit to its own HTML file", async () => {
  const first = await trial.files({ tight: true });
  const fit = { lift: 1 };
  const second = await trial.files(fit);
  expect(second.html).not.toBe(first.html);
  expect(readFileSync(second.html, "utf8")).toBe(JSON.stringify(fit));
});

test("propagates a Chrome spawn failure without retrying the same fit", async () => {
  const failure = Object.assign(new Error("Cannot spawn Chrome"), { code: "EACCES" });
  vi.mocked(renderPdf)
    .mockRejectedValueOnce(failure)
    .mockRejectedValueOnce(new Error("Unexpected second render"));
  try {
    expect(await rejection(trial.render({ tight: true }))).toBe("Error: Cannot spawn Chrome");
  } finally {
    vi.mocked(renderPdf).mockReset();
  }
});

test("retries a Chrome exit once on the same HTML and PDF paths", async () => {
  const fit = { tight: true };
  const { html, pdf } = await trial.files(fit);
  vi.mocked(renderPdf)
    .mockRejectedValueOnce(new ChromeExitedError("First Chrome exited"))
    .mockRejectedValueOnce(new ChromeExitedError("Second Chrome exited"));
  try {
    expect(await rejection(trial.render(fit))).toBe("Error: Second Chrome exited");
    expect(renderPdf).toHaveBeenNthCalledWith(2, html, pdf, { warm: true });
    expect(renderPdf).toHaveBeenCalledTimes(2);
  } finally {
    vi.mocked(renderPdf).mockReset();
  }
});

test("retries a Chrome exit from a separately evaluated module", async () => {
  vi.resetModules();
  const copy = await import("../scripts/chrome-pipe");
  expect(copy.ChromeExitedError).not.toBe(ChromeExitedError);
  vi.mocked(renderPdf)
    .mockRejectedValueOnce(new copy.ChromeExitedError("First Chrome exited"))
    .mockRejectedValueOnce(new Error("Second render reached"));
  try {
    expect(await rejection(trial.render({ tight: true }))).toBe("Error: Second render reached");
  } finally {
    vi.mocked(renderPdf).mockReset();
  }
});

test("waits for a sibling to read its file before a failed spacing trial closes", async () => {
  const fits = [{ lift: 1 }, { lift: 2 }];
  const failure = new Error("First render failed");
  const sibling = Promise.withResolvers<unknown>();
  vi.mocked(renderPdf)
    .mockRejectedValueOnce(failure)
    .mockImplementationOnce(async (html) => {
      await Bun.sleep(20);
      sibling.resolve(
        await Bun.file(html)
          .text()
          .catch((error: unknown) => error),
      );
      throw new Error("Second render failed");
    });
  try {
    const spacing = widestOnepagerSpacing(fits, "", trial).finally(() => trial.close());
    const failed = await spacing.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failed).toBe(failure);
    expect(await sibling.promise).toBe(JSON.stringify(fits[1]));
  } finally {
    vi.mocked(renderPdf).mockReset();
  }
});

test("closing the trial removes every candidate and its PDF work directory", async () => {
  const first = await trial.files({ tight: true });
  const second = await trial.files({ lift: 1 });
  trial.close();
  expect(existsSync(first.html)).toBe(false);
  expect(existsSync(second.html)).toBe(false);
  expect(existsSync(dirname(first.pdf))).toBe(false);
});
