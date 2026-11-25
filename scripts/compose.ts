#!/usr/bin/env bun
import { readFileSync, writeFileSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { getViteConfig } from "astro/config";
import type { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { AstroComponentFactory } from "astro/runtime/server/index.js";
import { createServer } from "vite";
import { withElements } from "./elements";
import { escapeHtml, languageTag } from "./fill";
import { bakeDocumentCss } from "./document-css";
import { subsetFaces } from "./font-faces";
import { isRecord, ROOT } from "./root";

const USAGE = `Usage: bun run documents-compose <Component> <props.json> <output.html>

Renders a document component of @hackersandwizards/documents (components/, such as DocRateCard
or DocLeistungsnachweis) with the props in the JSON file to a standalone HTML document: the document base baked in, each component's
scoped styles after it. A string prop "title" becomes the document's title. Runs Astro's compiler
of the project in the current directory.`;

// Consumers take the escape from here, beside the composer.
export { escapeHtml };

function isContainerClass(value: unknown): value is Pick<typeof AstroContainer, "create"> {
  return typeof value === "function" && "create" in value && typeof value.create === "function";
}

function isAstroComponentFactory(value: unknown): value is AstroComponentFactory {
  return (
    typeof value === "function" &&
    "isAstroComponentFactory" in value &&
    value.isAstroComponentFactory === true
  );
}

async function openDocumentVite(root: string) {
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
  return createServer({ ...config, configFile: false });
}

/** Astro's compiler for the document components: `render` returns a component's markup
 * (slots as HTML strings), `styles` the scoped styles of every component rendered so far. */
export async function openComposer(root = process.cwd()) {
  const server = await openDocumentVite(root);
  const load = async (id: string): Promise<Record<string, unknown>> => {
    const module: unknown = await server.ssrLoadModule(id);
    if (!isRecord(module)) throw new Error(`Expected a Vite module: ${id}`);
    return module;
  };
  const { experimental_AstroContainer } = await load("astro/container");
  if (!isContainerClass(experimental_AstroContainer))
    throw new Error("Expected the Astro container class");
  const container = await experimental_AstroContainer.create();
  return {
    async render(name: string, props: object, slots: Record<string, string> = {}) {
      if (!isRecord(props)) throw new Error("Expected a document props object");
      const path = join(ROOT, `components/${name}.astro`);
      const { default: component } = await load(path);
      if (!isAstroComponentFactory(component))
        throw new Error(`Expected an Astro component: ${path}`);
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
      for (const id of ids) {
        const { default: style } = await load(id.replace("&lang.css", "&inline&lang.css"));
        if (typeof style !== "string") throw new Error(`Expected CSS from ${id}`);
        css.push(style);
      }
      return css.join("\n");
    },
    close: () => server.close(),
  };
}

/** One component and its scoped styles, with a marker for the document base. */
export async function composeUnbakedPage(
  composer: Awaited<ReturnType<typeof openComposer>>,
  name: string,
  props: Record<string, unknown>,
): Promise<string> {
  const lang = languageTag(typeof props.lang === "string" ? props.lang : "de");
  const body = withElements(await composer.render(name, props));
  // Without a title the renderer takes the first heading's, as for every document without one.
  const title =
    typeof props.title === "string" ? `<title>${escapeHtml(props.title)}</title>\n` : "";
  return `<!doctype html>
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
`;
}

export async function composePage(
  composer: Awaited<ReturnType<typeof openComposer>>,
  name: string,
  props: Record<string, unknown>,
): Promise<string> {
  return subsetFaces(bakeDocumentCss(await composeUnbakedPage(composer, name, props)));
}

/** `--serve`: composes each request read from stdin, one JSON line `{ id, name, props }`, and
 * answers on fd 3 with `{ id, html }` or `{ id, error }`, keeping a composer per component, so
 * each page is the one a fresh run writes (a composer's styles are those of every component it
 * rendered). composeWarmDocument keeps this process. */
async function serve() {
  const composers = new Map<string, ReturnType<typeof openComposer>>();
  // Its stdin closes with the caller, however that ends.
  const lines = createInterface({ input: process.stdin });
  lines.on("close", () => process.exit(0));
  for await (const line of lines) {
    let id: unknown;
    let answer: object;
    try {
      const request: unknown = JSON.parse(line);
      if (!isRecord(request)) throw new Error("Expected a compose request object");
      id = request.id;
      const { name, props } = request;
      if (typeof name !== "string" || !/^Doc\w+$/.test(name))
        throw new Error(`Not a document component: ${String(name)}`);
      if (!isRecord(props)) throw new Error("Expected a document props object");
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
  const props: unknown = JSON.parse(readFileSync(resolve(propsPath), "utf8"));
  if (!isRecord(props)) throw new Error("Expected a document props object");
  const composer = await openComposer();
  try {
    writeFileSync(resolve(output), await composePage(composer, name, props));
    console.log(resolve(output));
  } finally {
    await composer.close();
  }
}
