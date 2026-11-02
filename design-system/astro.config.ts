// The design system (decision design-system-tool): Astrobook over design-system/stories, served at
// http://127.0.0.1:4330/design-system/ by `bun run design-system`. Astro and Astrobook run here only
// for this catalogue: neither is in the package's `files` or `exports`, so a consumer gets neither.
// Under Bun, since DocElements maps the brand's elements with Bun's HTMLRewriter.
import { defineConfig } from "astro/config";
import astrobook from "astrobook";

export default defineConfig({
  devToolbar: { enabled: false },
  server: { host: "127.0.0.1", port: 4330 },
  integrations: [
    astrobook({
      directory: "stories",
      subpath: "/design-system",
      title: "Dokumente design system",
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
    }),
  ],
});
