#!/usr/bin/env bun
import { readFileSync, writeFileSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { getViteConfig } from "astro/config";
import { createServer } from "vite";
import { withElements } from "./elements";
import { escapeHtml, languageTag } from "./fill";
import { bakeDocumentCss, subsetFaces } from "./render-pdf";
import { ROOT } from "./root";

const USAGE = `Usage: bun run documents-compose <Component> <props.json> <output.html>

Renders a document component of @hackersandwizards/documents (components/, such as DocRateCard
or DocLeistungsnachweis) with the props in the JSON file to a standalone HTML document: the document base baked in, each component's
scoped styles after it. A string prop "title" becomes the document's title. Runs Astro's compiler
of the project in the current directory.`;

// Consumers take the escape from here, beside the composer.
export { escapeHtml };

/** Astro's compiler for the document components: `render` returns a component's markup
 * (slots as HTML strings), `styles` the scoped styles of every component rendered so far. */
export async function openComposer(root = process.cwd()) {
  // Astro's compiler without the project's Astro config: its integrations have no part in a
  // document, and a cache of its own leaves a running dev server's untouched.
  const config = await getViteConfig(
    {
      root,
      cacheDir: "node_modules/.vite-documents",
      appType: "custom",
      logLevel: "error",
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    },
    {
      root,
      configFile: false,
      logLevel: "silent",
      devToolbar: { enabled: false },
      // The catalog's setting: Astro's default ("jsx") drops a line break between an inline
      // element and the text after it, and with it the space a reader sees.
      compressHTML: false,
    },
  )({ command: "serve", mode: "development" });
  const server = await createServer({ ...config, configFile: false });
  const { experimental_AstroContainer } = await server.ssrLoadModule("astro/container");
  const container = await experimental_AstroContainer.create();
  return {
    async render(name: string, props: object, slots: Record<string, string> = {}) {
      const path = join(ROOT, `components/${name}.astro`);
      const component = (await server.ssrLoadModule(path)).default;
      const html: string = await container.renderToString(component, { props, slots });
      return html.replace(/^<!DOCTYPE html>/i, "");
    },
    // The container renders markup only; each scoped style is a module of the graph loaded. The
    // &inline twins an earlier call loaded join the graph too, and are skipped.
    async styles() {
      const ids = [...server.moduleGraph.idToModuleMap.keys()].filter(
        (id) => id.includes("?astro&type=style") && !id.includes("&inline"),
      );
      const css: string[] = [];
      for (const id of ids)
        css.push((await server.ssrLoadModule(id.replace("&lang.css", "&inline&lang.css"))).default);
      return css.join("\n");
    },
    close: () => server.close(),
  };
}

/** One component with its props as a standalone page: `base` fills the marked style element, and
 * the faces it inlines are cut to the page's characters (subsetFaces). */
export async function composePage(
  composer: Awaited<ReturnType<typeof openComposer>>,
  name: string,
  props: Record<string, unknown>,
  base = bakeDocumentCss,
): Promise<string> {
  const lang = languageTag(typeof props.lang === "string" ? props.lang : "de");
  const body = withElements(await composer.render(name, props));
  // Without a title the renderer takes the first heading's, as for every document without one.
  const title =
    typeof props.title === "string" ? `<title>${escapeHtml(props.title)}</title>\n` : "";
  return subsetFaces(
    base(`<!doctype html>
<html lang="${lang}" data-hw-scale="print">
<head>
<meta charset="utf-8" />
${title}<style data-hw-document></style>
<style data-hw-components>
${await composer.styles()}
</style>
</head>
<body>
${body}
</body>
</html>
`),
  );
}

/** `--serve`: composes each request read from stdin, one JSON line `{ id, name, props }`, and
 * answers on fd 3 with `{ id, html }` or `{ id, error }`, keeping a composer per component, so
 * each page is the one a fresh run writes (a composer's styles are those of every component it
 * rendered). composeDocument's `warm` keeps this process. */
async function serve() {
  const composers = new Map<string, ReturnType<typeof openComposer>>();
  // Its stdin closes with the caller, however that ends.
  const lines = createInterface({ input: process.stdin });
  lines.on("close", () => process.exit(0));
  for await (const line of lines) {
    let id: unknown;
    let answer: object;
    try {
      const request = JSON.parse(line);
      id = request.id;
      const { name, props } = request;
      if (!/^Doc\w+$/.test(name)) throw new Error(`Not a document component: ${name}`);
      // A composer that failed to open is opened again on the next call, not kept failing.
      if (!composers.has(name))
        composers.set(
          name,
          openComposer().catch((error) => {
            composers.delete(name);
            throw error;
          }),
        );
      answer = { id, html: await composePage(await composers.get(name)!, name, props) };
    } catch (error) {
      answer = { id, error: (error as Error).stack ?? String(error) };
    }
    writeSync(3, `${JSON.stringify(answer)}\n`);
  }
}

if (import.meta.main && process.argv[2] === "--serve") await serve();
else if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(USAGE);
    process.exit(0);
  }
  const [name, propsPath, output] = args;
  if (args.length !== 3 || !/^Doc\w+$/.test(name)) {
    console.error(USAGE);
    process.exit(1);
  }
  // The props first: a missing or broken file fails before Vite boots.
  const props = JSON.parse(readFileSync(resolve(propsPath), "utf8"));
  const composer = await openComposer();
  try {
    writeFileSync(resolve(output), await composePage(composer, name, props));
    console.log(resolve(output));
  } finally {
    await composer.close();
  }
}
