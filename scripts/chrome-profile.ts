import { lstatSync, mkdtempSync, readdirSync, readlinkSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";

// A caller whose exit runs no handler, as `bun test` does, leaves its kept Chrome's profile behind,
// and a Chrome killed outright leaves its SingletonLock in it too. A profile an hour old that no
// running Chrome holds is removed; a younger one may be starting and has no lock yet.
const PROFILE = "hw-chrome-";
const STALE_PROFILE_MS = 3_600_000;
let profilesSwept = 0;

function profileLock(profile: string): string | undefined {
  const path = join(profile, "SingletonLock");
  try {
    if (!lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) return undefined;
    return readlinkSync(path);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EINVAL") return undefined;
    throw error;
  }
}

/** Whether a running Chrome holds the profile: its SingletonLock names `<host>-<pid>`, and a lock
 * naming another host counts as held. */
function profileHeld(profile: string): boolean {
  const lock = profileLock(profile);
  if (lock === undefined) return false;
  const [, host, pid] = /^(.*)-(\d+)$/.exec(lock) ?? [];
  if (host !== hostname()) return true;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "EPERM") return true;
    if (code === "ESRCH") return false;
    throw error;
  }
}

/** Whether a Chrome profile belongs to this user and is old enough to sweep. */
export function isStaleChromeProfile(profile: string): boolean {
  let stat;
  try {
    stat = lstatSync(profile, { throwIfNoEntry: false });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "EACCES" || error.code === "EPERM")
    )
      return false;
    throw error;
  }
  const uid = process.getuid?.();
  return (
    uid !== undefined &&
    stat !== undefined &&
    stat.uid === uid &&
    Date.now() - stat.mtimeMs > STALE_PROFILE_MS
  );
}

/** Removes each stale profile no Chrome holds, at most once an hour. */
function removeLeftProfiles() {
  if (Date.now() - profilesSwept < STALE_PROFILE_MS) return;
  profilesSwept = Date.now();
  const root = tmpdir();
  const removalErrors: unknown[] = [];
  for (const name of readdirSync(root).filter((n) => n.startsWith(PROFILE))) {
    const profile = join(root, name);
    if (!isStaleChromeProfile(profile) || profileHeld(profile)) continue;
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
