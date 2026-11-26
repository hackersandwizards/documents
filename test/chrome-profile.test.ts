import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  utimesSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
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

function staleProfile(lock?: string) {
  const profile = join(root, "hw-chrome-stale");
  mkdirSync(profile);
  if (lock !== undefined) symlinkSync(lock, join(profile, "SingletonLock"));
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

test("propagates a denied read of Chrome's profile lock", async () => {
  staleProfile(`${hostname()}-${process.pid}`);
  const denied = Object.assign(new Error("Cannot inspect Chrome lock"), { code: "EACCES" });
  vi.mocked(readlinkSync).mockImplementationOnce(() => {
    throw denied;
  });
  const { makeChromeProfile } = await import("../scripts/chrome-profile");
  expect(makeChromeProfile).toThrow(denied);
});

test("propagates an unexpected process probe failure for a locked Chrome profile", async () => {
  staleProfile(`${hostname()}-${process.pid}`);
  const failure = new TypeError("Cannot probe Chrome process");
  const kill = vi.spyOn(process, "kill").mockImplementationOnce(() => {
    throw failure;
  });
  try {
    const { makeChromeProfile } = await import("../scripts/chrome-profile");
    expect(makeChromeProfile).toThrow(failure);
  } finally {
    kill.mockRestore();
  }
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

test("propagates an unexpected error while checking a Chrome profile's age", async () => {
  const { isStaleChromeProfile } = await import("../scripts/chrome-profile");
  const failure = Object.assign(new Error("Cannot stat Chrome profile"), { code: "EIO" });
  vi.mocked(lstatSync).mockImplementationOnce(() => {
    throw failure;
  });
  expect(() => isStaleChromeProfile(root)).toThrow(failure);
});
