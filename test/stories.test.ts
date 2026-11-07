import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { TYPES } from "../catalog/types";

const ROOT = resolve(import.meta.dir, "..");
const components = readdirSync(join(ROOT, "components"))
  .filter((f) => f.endsWith(".astro"))
  .map((f) => f.replace(/\.astro$/, ""));

test("every component has a story", () => {
  const stories = (readdirSync(join(ROOT, "catalog/stories"), { recursive: true }) as string[])
    .filter((f) => f.endsWith(".stories.ts"))
    .map((f) =>
      f
        .split("/")
        .pop()!
        .replace(/\.stories\.ts$/, ""),
    );
  expect(components.filter((c) => !stories.includes(c))).toEqual([]);
});

/** Every component a page shows, its own imports followed. */
function shown(component: string, seen: Set<string>): Set<string> {
  if (seen.has(component)) return seen;
  seen.add(component);
  const source = readFileSync(join(ROOT, "components", `${component}.astro`), "utf8");
  for (const [, child] of source.matchAll(/from "\.\/(Doc\w+)\.astro"/g)) shown(child, seen);
  return seen;
}

test("every component appears on a type page, and every type page is listed", () => {
  const pages = readdirSync(join(ROOT, "catalog/pages/types"), { recursive: true }) as string[];
  const covered = new Set<string>();
  for (const page of pages.filter((p) => /\.(astro|ts)$/.test(p)))
    for (const [, c] of readFileSync(join(ROOT, "catalog/pages/types", page), "utf8").matchAll(
      /components\/(Doc\w+)\.astro"/g,
    ))
      shown(c, covered);
  // The onepager page composes DocOnepager through composeOnepager, which renders DocCard.
  shown("DocOnepager", covered);
  expect(components.filter((c) => !covered.has(c))).toEqual([]);
  const listed = new Set(
    pages
      .map((p) => p.split("/")[0]!.replace(/\.astro$/, ""))
      .filter((p) => !p.includes(".") && !p.startsWith("_")),
  );
  expect([...listed].sort()).toEqual(TYPES.map((t) => t.file).sort());
});

test("every type page carries one robots tag, noindex", () => {
  const tags = TYPES.map((t) => [
    t.file,
    readFileSync(join(ROOT, "dist/types", t.file, "index.html"), "utf8").match(
      /<meta\b[^>]*\bname="robots"[^>]*>/g,
    ) ?? [],
  ]);
  const off = tags.filter(([, found]) => found.length !== 1 || !found[0]!.includes("noindex"));
  expect(off).toEqual([]);
});
