import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../scripts/root";
import { brandOrder } from "../layer-order";

describe("a composed page declares the layer order once, the brand's, first", () => {
  it("a type page, linking it ahead of every stylesheet", () => {
    const html = readFileSync(join(ROOT, "dist/types/angebot/index.html"), "utf8");
    expect(html.match(/@layer\b|<link\b[^>]*\brel="?stylesheet[^>]*>/)?.[0]).toContain(
      "/tokens/layers.css",
    );
  });

  it("the catalog's home, ahead of its bundle", () => {
    const html = readFileSync(join(ROOT, "dist/index.html"), "utf8");
    // The shell's ground layer, then brand's order right after it, ahead of every stylesheet link.
    const at = html.indexOf("@layer hw-catalog-ground;" + brandOrder);
    expect(at).toBeGreaterThan(-1);
    expect(html.search(/@layer\b|<link\b[^>]*\brel="?stylesheet/)).toBe(at);
  });
});
