import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Every component has a story in the design system (design-system/stories/<group>/<Name>.stories.ts),
// so the Astrobook home shows each as a tile.
const ROOT = resolve(import.meta.dir, "..");

test("every component has a story", () => {
  const components = readdirSync(join(ROOT, "components"))
    .filter((f) => f.endsWith(".astro"))
    .map((f) => f.replace(/\.astro$/, ""));
  const stories = (
    readdirSync(join(ROOT, "design-system/stories"), { recursive: true }) as string[]
  )
    .filter((f) => f.endsWith(".stories.ts"))
    .map((f) =>
      f
        .split("/")
        .pop()!
        .replace(/\.stories\.ts$/, ""),
    );
  expect(components.filter((c) => !stories.includes(c))).toEqual([]);
});
