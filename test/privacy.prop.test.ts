import { fc, test } from "@hackersandwizards/scaffolding/property";
import { expect } from "vitest";
import { scanSamples } from "../scripts/privacy";

test.prop(
  [
    fc.array(fc.stringMatching(/^[a-zé]{1,32}$/), { maxLength: 24 }),
    fc.constantFrom("constructor", "__proto__", "toString"),
  ],
  {
    examples: [
      [[], "__proto__"],
      [["é".repeat(1024)], "constructor"],
      [["e", "e"], "toString"],
    ],
  },
)(
  "the name scan visits each array entry under an own key and reports its exact path",
  (words, key) => {
    const unknownNames = words.map((word) => `Zzx${word}`);
    const entries = unknownNames.map((name) => ({ personName: `Mara, ${name}`, label: name }));
    expect(scanSamples({ [key]: entries })).toEqual(
      unknownNames.map((name, index) => `${key}[${index}].personName: ${name}`),
    );
  },
);
