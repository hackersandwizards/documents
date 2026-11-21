import { fc, test } from "@hackersandwizards/scaffolding/property";
import { expect } from "vitest";
import { pruneStyles } from "../scripts/prune";

const names = fc.uniqueArray(fc.stringMatching(/^[a-zéß]{1,12}$/), { maxLength: 14 });

test.prop([names, names, names], {
  examples: [
    [[], [], []],
    [["constructor", "__proto__", "toString"], ["größe", "🧙"], ["c".repeat(1024)]],
    [["a"], ["b"], ["c"]],
  ],
})(
  "plain rules survive exactly when their class, id or attribute occurs in the markup",
  (classes, ids, attributes) => {
    const markers = attributes.map((_, i) => `data-prop-${i}`);
    const markup = `<p class="${classes.join(" ")}" ${markers.join(" ")}></p>${ids.map((id) => `<i id="${id}"></i>`).join("")}`;
    const selectors = [
      ...classes.map((name) => `.${name}`),
      ...ids.map((name) => `#${name}`),
      ...markers.map((name) => `[${name}]`),
    ];
    const kept = selectors.map((selector) => `${selector}{color:red}`).join("");
    const absent = selectors.map((selector) =>
      selector.endsWith("]") ? `${selector.slice(0, -1)}-missing]` : `${selector}-missing`,
    );
    const css = kept + [...absent, "article"].map((selector) => `${selector}{color:blue}`).join("");
    expect(pruneStyles(`<style>${css}</style>${markup}`)).toBe(`<style>${kept}</style>${markup}`);
  },
);

test.prop([fc.integer({ min: 1, max: 24 }), fc.integer({ min: 0, max: 24 })], {
  examples: [
    [1, 0],
    [24, 24],
  ],
})(
  "only the section of a custom-property chain that reaches a used declaration survives",
  (length, offset) => {
    const properties = Array.from({ length }, (_, i) =>
      i === 0 ? "--v0:1px" : `--v${i}:var(--v${i - 1})`,
    );
    const needed = offset % length;
    const use = `p{margin:var(--v${needed})}`;
    expect(pruneStyles(`<style>:root{${properties.join(";")}}${use}</style><p>x</p>`)).toBe(
      `<style>:root{${properties.slice(0, needed + 1).join(";")}}${use}</style><p>x</p>`,
    );
  },
);
