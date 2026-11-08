// Astro runs under Bun, since DocElements maps the brand's elements with Bun's HTMLRewriter.
import { globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import { catalog } from "@hackersandwizards/scaffolding/catalog";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandPath, LINKED_CSS } from "./brand";
import { TYPES } from "./types";

const BASE = "/documents";
// Each story group's former German name: a page published under it forwards.
const FORMER_GROUPS: Record<string, string> = { Types: "Typen", Components: "Komponenten" };

export default defineConfig({
  base: BASE,
  srcDir: ".",
  devToolbar: { enabled: false },
  server: { host: "127.0.0.1", port: 4330 },
  compressHTML: false,
  redirects: {
    "/design-system": `${BASE}/`,
    "/specimen": `${BASE}/`,
    ...Object.fromEntries(
      TYPES.map((t) => [`/specimen/${t.file}.html`, `${BASE}/types/${t.file}/index.html`]),
    ),
    "/specimen/elemente.html": `${BASE}/types/elements/index.html`,
    "/types/elemente": `${BASE}/types/elements/index.html`,
  },
  integrations: [
    catalog({
      product: "Documents",
      lead: "Every document type of @hackersandwizards/documents and the components it is built from, on A4 at print size. The documents are German or English; every name is invented and every amount a placeholder.",
      css: [
        // tokens.css holds an @theme block a browser skips: tokens.root.css is its :root twin.
        "@hackersandwizards/brand/tokens.root.css",
        "@hackersandwizards/brand/print.css",
        "@hackersandwizards/brand/document.css",
        "@hackersandwizards/brand/marker.css",
        "@hackersandwizards/brand/elements.css",
      ],
      head: "./Head.astro",
      home: "./Home.astro",
      previewSize: [794, 1123],
      groupOrder: ["Types", "Components"],
      // The brand files the type pages link.
      copy: [
        ...new Set(LINKED_CSS.map((f) => dirname(brandPath(f)))),
        // elements.css imports it from outside its folder.
        brandPath("disclosure.css"),
        `${dirname(brandPath("logos/favicon.svg"))}/*.svg`,
        brandPath("logos/favicon.ico"),
      ],
    }),
    {
      // Each story page under a group's former name, at the site's root and under /catalog/,
      // forwards to its page now.
      name: "former-group-paths",
      hooks: {
        "astro:build:done": ({ dir }) => {
          const out = fileURLToPath(dir);
          for (const page of globSync(
            `{dashboard,stories}/{${Object.keys(FORMER_GROUPS)}}/**/index.html`,
            {
              cwd: out,
            },
          )) {
            const to = encodeURI(`${BASE}/${dirname(page)}/`);
            const [area, group, ...rest] = page.split("/");
            const former = [area, FORMER_GROUPS[group!], ...rest].join("/");
            for (const stub of [join(out, former), join(out, "catalog", former)]) {
              mkdirSync(dirname(stub), { recursive: true });
              writeFileSync(
                stub,
                `<!doctype html><meta charset="utf-8"><title>Moved</title><link rel="canonical" href="${to}"><meta http-equiv="refresh" content="0; url=${to}"><script>location.replace(${JSON.stringify(to)}+location.search+location.hash)</script><a href="${to}">${to}</a>\n`,
              );
            }
          }
        },
      },
    },
    {
      // The catalog keeps Astro's default inlineStylesheets ("auto"), which links its shared
      // stylesheet, so the home's preview frames load one cached copy. A type page opens from disk,
      // as the gate's checks and the PDF path read it: the components' stylesheets Astro links go
      // inline, with the marker a composed document's carry (data-hw-components), so
      // documents-styles reads the page as one. Its brand files stay linked beside it (`copy`).
      name: "type-page-styles",
      hooks: {
        "astro:build:done": ({ pages, dir }) => {
          const linked = new RegExp(
            `<link\\b[^>]*\\bhref="${BASE}/(_astro/[^"]+\\.css)"[^>]*>`,
            "g",
          );
          for (const { pathname } of pages.filter((p) => p.pathname.startsWith("types/"))) {
            const file = new URL(`${pathname}index.html`, dir);
            const html = readFileSync(file, "utf8").replace(
              linked,
              (_, css: string) =>
                `<style data-hw-components>${readFileSync(new URL(css, dir), "utf8")}</style>`,
            );
            // A link left would open from disk without the components' styles.
            if (html.includes(`${BASE}/_astro/`))
              throw new Error(`type-page-styles: ${pathname} still links ${BASE}/_astro/`);
            writeFileSync(file, html.replaceAll("<style>", "<style data-hw-components>"));
          }
        },
      },
    },
  ],
});
