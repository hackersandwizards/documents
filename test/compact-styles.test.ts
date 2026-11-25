import { expect, test } from "vitest";
import { parseLayerItem } from "../scripts/compact-styles";

test.each([
  [{ prelude: "@layer base, doc.print;" }, { statement: true, layers: ["base", "doc.print"] }],
  [
    { prelude: "@layer doc", body: "" },
    { statement: false, layers: ["doc"] },
  ],
  [{ prelude: "@layer doc" }, undefined],
  [{ prelude: "@layer base, doc", body: "" }, undefined],
  [{ prelude: "@layer escaped\\2e name;" }, undefined],
  [{ prelude: "@import 'style.css';" }, undefined],
])("identifies named layer statements and blocks in %j", (item, expected) => {
  expect(parseLayerItem(item)).toEqual(expected);
});
