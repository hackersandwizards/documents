import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { makeChromeProfile } from "../scripts/chrome-profile";

const root = realpathSync(mkdtempSync(join(tmpdir(), "chrome-profile-test-")));

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

test("creates distinct Chrome profiles in the temporary root", () => {
  vi.stubEnv("TMPDIR", root);
  const first = makeChromeProfile();
  const second = makeChromeProfile();
  expect(relative(root, first)).toMatch(/^hw-chrome-[^/]+$/);
  expect(existsSync(first)).toBe(true);
  expect(relative(root, second)).toMatch(/^hw-chrome-[^/]+$/);
  expect(existsSync(second)).toBe(true);
  expect(first).not.toBe(second);
});
