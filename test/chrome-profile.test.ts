import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("node:fs", { spy: true });
const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
let root: string;

beforeEach(() => {
  vi.resetModules();
  root = realpathSync(mkdtempSync(join(tmpdir(), "chrome-profile-test-")));
  vi.stubEnv("TMPDIR", root);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function staleProfile() {
  const profile = join(root, "hw-chrome-stale");
  mkdirSync(profile);
  const old = new Date(Date.now() - 2 * 3_600_000);
  utimesSync(profile, old, old);
  return profile;
}

test("creates distinct Chrome profiles in the temporary root", async () => {
  const { makeChromeProfile } = await import("../scripts/chrome-profile");
  const first = makeChromeProfile();
  const second = makeChromeProfile();
  expect(relative(root, first)).toMatch(/^hw-chrome-[^/]+$/);
  expect(existsSync(first)).toBe(true);
  expect(relative(root, second)).toMatch(/^hw-chrome-[^/]+$/);
  expect(existsSync(second)).toBe(true);
  expect(first).not.toBe(second);
});

test("creates a Chrome profile when the stale profile vanishes before removal", async () => {
  const stale = staleProfile();
  vi.mocked(rmSync).mockImplementationOnce((profile, options) => {
    fs.rmSync(stale, { recursive: true });
    fs.rmSync(profile, options);
  });
  const { makeChromeProfile } = await import("../scripts/chrome-profile");
  expect(existsSync(makeChromeProfile())).toBe(true);
});

test("propagates permission errors while removing stale Chrome profiles", async () => {
  staleProfile();
  const denied = Object.assign(new Error("Cannot remove stale Chrome profile"), { code: "EACCES" });
  vi.mocked(rmSync).mockImplementationOnce(() => {
    throw denied;
  });
  const { makeChromeProfile } = await import("../scripts/chrome-profile");
  expect(makeChromeProfile).toThrow(denied);
});
