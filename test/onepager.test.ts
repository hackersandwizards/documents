import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openComposer } from "../scripts/compose";
import { composeOnepager } from "../scripts/onepager";
import { ROOT } from "../scripts/root";
import { onepager } from "../scripts/samples";
import { fallbackFamilies, withLinkedBrand, limit } from "./probe";

let composer: Awaited<ReturnType<typeof openComposer>>;
beforeAll(async () => {
  composer = await openComposer(ROOT);
});
afterAll(() => composer?.close());

describe("composeOnepager, linked", () => {
  it("defines every fallback family its stacks name through the brand files it links", async () => {
    const page = withLinkedBrand(await composeOnepager(composer, onepager, (file) => file));
    const { named, defined } = fallbackFamilies(page);
    expect(named.length).toBeGreaterThan(0);
    expect(defined).toEqual(named);
  });
});

describe("onepagerBrandFiles", () => {
  // The trace mocks node:fs, so it runs in its own process; a failed expect fails the command.
  it(
    "lists exactly the brand files a traced render reads",
    () => {
      expect(() =>
        execFileSync(
          "bun",
          ["--bun", "vitest", "run", "--config", "test/onepager-trace.config.ts"],
          {
            cwd: ROOT,
            timeout: limit(55_000),
          },
        ),
      ).not.toThrow();
    },
    limit(60_000),
  );
});
