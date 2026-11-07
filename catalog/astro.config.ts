// Astro runs under Bun, since DocElements maps the brand's elements with Bun's HTMLRewriter.
import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import { catalog } from "@hackersandwizards/scaffolding/catalog";
import { dirname } from "node:path";
import { brandPath, LINKED_CSS } from "./brand";
import { TYPES } from "./types";

const BASE = "/documents";

export default defineConfig({
  base: BASE,
  srcDir: ".",
  devToolbar: { enabled: false },
  server: { host: "127.0.0.1", port: 4330 },
  // The type pages open from disk, as the gate's checks and the PDF path read them: each page's
  // styles inline, its brand files linked beside it (`copy`), its markup as written.
  build: { inlineStylesheets: "always" },
  compressHTML: false,
  redirects: {
    "/design-system": `${BASE}/`,
    "/specimen": `${BASE}/`,
    ...Object.fromEntries(
      TYPES.map((t) => [`/specimen/${t.file}.html`, `${BASE}/types/${t.file}/index.html`]),
    ),
  },
  integrations: [
    catalog({
      product: "Documents",
      lead: "Jeder Dokumenttyp der Engine @hackersandwizards/documents und die Komponenten, aus denen die Typen bestehen, auf A4 im Druckmaß. Alle Daten sind erfunden, jeder Betrag ist ein Platzhalter.",
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
      groupOrder: ["Typen", "Komponenten"],
      // The brand files the type pages link: the Git install's PNG logos are LFS pointers.
      copy: [
        ...new Set(LINKED_CSS.map((f) => dirname(brandPath(f)))),
        `${dirname(brandPath("logos/favicon.svg"))}/*.svg`,
        brandPath("logos/favicon.ico"),
      ],
    }),
    {
      // The components' styles Astro writes into a type page's head carry the marker a composed
      // document's do (data-hw-components), so documents-styles reads the page as one.
      name: "type-page-styles",
      hooks: {
        "astro:build:done": ({ pages, dir }) => {
          for (const { pathname } of pages.filter((p) => p.pathname.startsWith("types/"))) {
            const file = new URL(`${pathname}index.html`, dir);
            const html = readFileSync(file, "utf8");
            writeFileSync(file, html.replaceAll("<style>", "<style data-hw-components>"));
          }
        },
      },
    },
  ],
});
