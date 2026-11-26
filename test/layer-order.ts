import { defined } from "@hackersandwizards/scaffolding/defined";
import { readFileSync } from "node:fs";
import { brandFile } from "../scripts/render-pdf";

// Only a layer's first mention places it, so a page carries the brand's whole order once, ahead
// of every layer block.
export const LAYER = /@layer\s+[\w.,\s-]+?\s*[;{]/g;
export const brandOrder = defined(
  readFileSync(brandFile("layers.css"), "utf8").match(LAYER),
  "brand layer order",
)[0];
