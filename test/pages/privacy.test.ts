import { expect, test } from "vitest";
import { scanText } from "../../scripts/privacy";
import { ROOT } from "../../scripts/root";

test("the package is clean", () => {
  expect(scanText(ROOT)).toEqual([]);
});

test("a deny term hits as a whole word only", () => {
  const hits = scanText(ROOT, ["Musterwerk"]);
  expect(hits.length).toBeGreaterThan(0);
  expect(scanText(ROOT, ["Muster" + "w"])).toEqual([]);
});
