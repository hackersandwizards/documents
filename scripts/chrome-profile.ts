import { lstatSync, mkdtempSync, readdirSync, readlinkSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";

// A caller whose exit runs no handler, as `bun test` does, leaves its kept Chrome's profile behind,
// and a Chrome killed outright leaves its SingletonLock in it too. A profile an hour old that no
// running Chrome holds is removed; a younger one may be starting and has no lock yet.
const PROFILE = "hw-chrome-";
const STALE_PROFILE_MS = 3_600_000;
let profilesSwept = 0;

/** Whether a running Chrome holds the profile: its SingletonLock names `<host>-<pid>`, and a lock
 * naming another host counts as held. */
function profileHeld(profile: string): boolean {
  let lock: string;
  try {
    lock = readlinkSync(join(profile, "SingletonLock"));
  } catch {
    return false;
  }
  const [, host, pid] = /^(.*)-(\d+)$/.exec(lock) ?? [];
  if (host !== hostname()) return true;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Removes each stale profile no Chrome holds, at most once an hour. A profile the sweep
 * cannot stat is left if missing or inaccessible. */
function removeLeftProfiles() {
  if (Date.now() - profilesSwept < STALE_PROFILE_MS) return;
  profilesSwept = Date.now();
  const root = tmpdir();
  const removalErrors: unknown[] = [];
  for (const name of readdirSync(root).filter((n) => n.startsWith(PROFILE))) {
    const profile = join(root, name);
    let made: number;
    try {
      made = lstatSync(profile).mtimeMs;
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === "ENOENT" || code === "EACCES" || code === "EPERM") continue;
      throw error;
    }
    if (Date.now() - made <= STALE_PROFILE_MS || profileHeld(profile)) continue;
    try {
      rmSync(profile, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") removalErrors.push(error);
    }
  }
  if (removalErrors.length === 1) throw removalErrors[0];
  if (removalErrors.length > 1)
    throw new AggregateError(removalErrors, "Removing stale Chrome profiles failed");
}

export function makeChromeProfile(): string {
  removeLeftProfiles();
  return mkdtempSync(join(tmpdir(), PROFILE));
}
