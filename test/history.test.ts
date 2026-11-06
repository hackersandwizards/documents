import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

// What the package ships is public wherever a consumer serves or bundles it: a comment in it states
// what the code does and why, never the history behind it. Scores, review rounds, dates, decision
// and item ids, pointers to review notes and names go to the commit message or docs/agent-work/.
const ROOT = resolve(import.meta.dir, "..");
const ITEM_DIR = join(ROOT, "docs/agent-work/items");
// The folder is gone once its last item closes.
const ITEMS = (existsSync(ITEM_DIR) ? readdirSync(ITEM_DIR) : [])
  .map((f) => basename(f, ".md"))
  .filter((id) => id.includes("-"));
const ITEM = new RegExp(`\\b(${ITEMS.join("|")})\\b`);
const HISTORY: [string, RegExp][] = [
  ["decision id", /\b(?:os\s+decision|decisions?\s+[a-z0-9]+(?:-[a-z0-9]+)+)/i],
  [
    "review score",
    /\bblind[\s-]+(?:panels?|reviews?|rounds?|runs?|A\/B)|\bscored\b|\bnoise\s+\d|\boverall of 10\b|\bpersonas?\b|\breviewers?\b/i,
  ],
  ["review pointer", /\bdocs\/agent-work\//],
  ["item id", /\b(?!UTF-|ISO-)[A-Z]{2,4}-\d+\b|\b[Ii]tems?\s+[a-z0-9]+(?:-[a-z0-9]+)+/],
  ["date", /\b20\d\d-\d\d-\d\d\b|\b\d{1,2}\.(?:0[1-9]|1[0-2])\.(?:20\d\d)?(?!\w)/],
  ["person", /\b(?:Benedikt|Stefan|Stemmildt|Munz)\b/],
];
const findHistory = (text: string) => {
  const own = text.match(ITEM)?.[1];
  return [
    ...HISTORY.filter(([, re]) => re.test(text)).map(([kind]) => kind),
    ...(own ? [`item id ${own}`] : []),
  ];
};
// Block, HTML and line comments; a `//` inside a URL is no comment.
const comments = (source: string) =>
  (source.match(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<![:"'`\w])\/\/.*/g) ?? []).join("\n");

const shippedCode = Bun.spawnSync(["bun", "pm", "pack", "--dry-run"], { cwd: ROOT })
  .stdout.toString()
  .split("\n")
  .flatMap((line) => line.match(/^packed \S+ (.+)$/)?.[1] ?? [])
  .filter((f) => /\.(?:css|astro|ts|html)$/.test(f));

test("the patterns hit the history the shipped files carried", () => {
  // Verbatim from the comments that shipped up to v1.8.3.
  for (const [line, kind] of [
    [
      "/* No tint behind the hero's text (os decision br-gradient-behind-content). */",
      "decision id",
    ],
    ["so a zero reads as a count and not as a note (blind panel 06.11.: same type 8.8", "date"],
    ["8.4, small muted sans 6.2, noise 0.7). */", "review score"],
    ["// teal in the h4 role, the money colour of Price.astro (blind round 4", "review score"],
    ["// The markers' key: blind runs read the band colours", "review score"],
    ["(blind round 4, os/docs/agent-work/2026-10-29-document-accents.md", "review pointer"],
    ["Chrome costs about 0.55 s a render, the kept one about 0.1 s (measured 2026-11-02)", "date"],
    ["(Benedikt, 01.11.: the total sat indented", "person"],
  ])
    expect(findHistory(line)).toContain(kind);
  if (ITEMS.length) expect(findHistory(`see ${ITEMS[0]}`)).toContain(`item id ${ITEMS[0]}`);
  for (const line of ["teal at 1.2.", "a ratio of 4.5.", "the page is UTF-8", "ISO-639 codes"])
    expect(findHistory(line)).toEqual([]);
  expect(comments("a { b: c } /* one */ // two\nx = 'https://x.y'")).toBe("/* one */\n// two");
});

test("no shipped file's comments carry review history", () => {
  expect(shippedCode.length).toBeGreaterThan(30);
  const hits = shippedCode
    .map((file) => ({ file, kinds: findHistory(comments(readFileSync(join(ROOT, file), "utf8"))) }))
    .filter((h) => h.kinds.length);
  expect(hits).toEqual([]);
});
