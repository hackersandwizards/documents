import { readFileSync } from "node:fs";
import { brandFile } from "../scripts/render-pdf";

// Only a layer's first mention places it, so a page carries the brand's whole order once, ahead
// of every layer block.
export const LAYER = /@layer\s+[\w.,\s-]+?\s*[;{]/g;
export const brandOrder = readFileSync(brandFile("layers.css"), "utf8").match(LAYER)![0];
