import { join } from "node:path";
import { getViteConfig } from "astro/config";
import type { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { AstroComponentFactory } from "astro/runtime/server/index.js";
import { createServer } from "vite";
import { withElements } from "./elements";
import { escapeHtml, languageTag } from "./fill";
import { bakeDocumentCss } from "./document-css";
import { subsetFaces } from "./font-faces";
import { isRecord, ROOT } from "./root";

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
      if (typeof name !== "string" || !/^Doc\w+$/.test(name))
        throw new Error(`Not a document component: ${String(name)}`);
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

/** Compose one component with its props, bake the marked stylesheet, and cut the inlined faces
 * to the page's characters. */
export async function composePage(
  composer: Awaited<ReturnType<typeof openComposer>>,
  name: string,
  props: Record<string, unknown>,
): Promise<string> {
  return subsetFaces(bakeDocumentCss(await composeUnbakedPage(composer, name, props)));
}
