import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { onepagerTrials } from "../scripts/onepager-trials";

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

test("closing the trial removes every candidate and its PDF work directory", async () => {
  const first = await trial.files({ tight: true });
  const second = await trial.files({ lift: 1 });
  trial.close();
  expect(existsSync(first.html)).toBe(false);
  expect(existsSync(second.html)).toBe(false);
  expect(existsSync(dirname(first.pdf))).toBe(false);
});
