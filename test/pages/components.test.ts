import { afterAll, beforeAll, expect, test } from "vitest";
import { decodeHTML } from "entities";
import { openComposer } from "../../scripts/compose";
import { cssString } from "../../scripts/fill";
import { ROOT } from "../../scripts/root";
import { probePage, limit } from "../probe";

const P = "[PLACEHOLDER]";
let composer: Awaited<ReturnType<typeof openComposer>>;
beforeAll(async () => {
  composer = await openComposer(ROOT);
});
afterAll(() => composer?.close());

// A running head's text reaches a raw <style> as a CSS string: Chrome reads back each character,
// a newline from a YAML block scalar, a control character, a quote, a backslash and </style> too.
test(
  "cssString writes a string CSS reads back as written",
  () => {
    const texts = ["Angebot 2026-014\n", "a\u0001b", 'Zitat "x"', "C:\\pfad", "</style>", "Plain"];
    const probe = `const decode = (s) => s.slice(1, -1).replace(/\\\\([0-9a-f]{1,6}) ?|\\\\(.)/gi, (_, hex, c) => hex ? String.fromCodePoint(parseInt(hex, 16)) : c);
    return JSON.stringify(${JSON.stringify(texts.map(cssString))}.map((css) => { const sheet = new CSSStyleSheet(); sheet.replaceSync("p { content: " + css + "; }"); return decode(sheet.cssRules[0].style.content); }));`;
    const seen = probePage("<!doctype html><html><body></body></html>", probe);
    expect(JSON.parse(decodeHTML(seen))).toEqual(texts);
  },
  limit(30_000),
);

// The handout's layout script runs beside a page script of the consumer's.
test("DocHandout keeps a closing run of notes in order beside its block, beside any page script", async () => {
  const html = await composer.render("DocHandout", {
    title: P,
    subtitle: P,
    notes: "3",
    chapters: [
      {
        title: P,
        html: '<p>block</p><aside class="margin-note">one</aside><aside class="margin-note">two</aside><h2>next</h2><div class="note-lines"></div>',
      },
    ],
  });
  const page = `<!doctype html><html><head><script>const options = 1; const flow = 2; const shared = 3;</script></head><body>${html}</body></html>`;
  const order = probePage(
    page,
    `return [...document.querySelectorAll(".doc-prose :is(h1, h2, p, aside)")].map((el) => el.textContent.trim()).join("|") + "#" + document.querySelectorAll(".note-lines span").length;`,
  );
  expect(order).toBe(`${P}|one|two|block|next#3`);
});

test("DocHandout wraps HTML link text and keeps laying out after an SVG link", async () => {
  const html = await composer.render("DocHandout", {
    title: P,
    subtitle: P,
    chapters: [
      {
        title: P,
        html: `<div class="note-lines" data-lines="2"></div>
          <svg><a href="https://example.com/"><text>SVG link</text></a></svg>
          <p><a href="https://www.example.com/a?b=c&amp;d=e">https://www.example.com/a?b=c&amp;d=e</a></p>
          <h2>Next</h2><p>Body</p>`,
      },
    ],
  });
  const result = probePage(
    `<!doctype html><html><body>${html}</body></html>`,
    `return JSON.stringify({
      notes: document.querySelectorAll(".note-lines span").length,
      svg: document.querySelector("svg a text").textContent,
      link: document.querySelector("section p a").textContent,
      breaks: document.querySelectorAll("section p a wbr").length,
      grouped: document.querySelector(".keep > h2")?.textContent,
      layout: globalThis.hwLayout?.length,
    });`,
  );
  expect(JSON.parse(decodeHTML(result))).toEqual({
    notes: 2,
    svg: "SVG link",
    link: "example.com/a?b=c&d=e",
    breaks: 5,
    grouped: "Next",
    layout: 1,
  });
});
