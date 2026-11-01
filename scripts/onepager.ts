// composeOnepager: DocOnepager as a standalone page on its own stylesheet: the brand's tokens.css
// and print.css, document.css's print scale (its first :root block), its list marker and
// wordmark rule, the scoped styles of DocHeader and DocCard, then onepager.css. Every
// `<div class="card ...">` in the body opens with DocCard's tag. `brand` is the brand package's
// folder as the page reaches it: the page opens from disk beside the installed package.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { escapeHtml, type openComposer } from "./compose";
import { brandFile } from "./render-pdf";

const ROOT = join(import.meta.dir, "..");

function rule(css: string, pattern: RegExp, what: string) {
  const found = css.match(pattern)?.[0];
  if (!found) throw new Error(`document.css: no ${what}`);
  return found;
}

/** The stylesheet ahead of the components' styles; the brand files inlined unless `link`. */
function baseCss(brand: string, link: boolean) {
  const documentCss = readFileSync(join(ROOT, "document.css"), "utf8");
  return [
    ...(link
      ? []
      : [
          readFileSync(brandFile("tokens.css"), "utf8").replace(/@theme\s*\{/, ":root {"),
          readFileSync(brandFile("print.css"), "utf8").replaceAll(
            'url("fonts/',
            `url("${brand}/tokens/fonts/`,
          ),
        ]),
    rule(documentCss, /^:root \{[\s\S]*?^\}/m, ":root block holding the print scale"),
    // Every h&w document draws the identical list marker: the base's rule, never a copy.
    rule(documentCss, /^ul li \{[\s\S]*?^\}/m, "`ul li` rule holding the list marker"),
    // DocHeader sets its wordmark as HTML, outside its scoped styles: the base's rule sizes it.
    rule(documentCss, /^\.brand \.brand-name \.wordmark \{[\s\S]*?^\}/m, "wordmark rule"),
  ].join("\n");
}

/** The brand's tokens, faces and favicon as links, as every specimen page carries them. */
const linked = (
  brand: string,
) => `<link rel="icon" href="${brand}/logos/favicon.ico" sizes="32x32" />
<link rel="icon" href="${brand}/logos/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="${brand}/generated/tokens.root.css" />
<link rel="stylesheet" href="${brand}/tokens/print.css" />
`;

export interface OnepagerPage {
  lang: "de" | "en";
  title: string;
  /** The blocks after the header, as HTML. */
  html: string;
  /** Classes on the body element, such as the fit pass's `tight`, `lift*` and `air*`. */
  bodyClass?: string;
  /** Rules after onepager.css, such as the fit pass's margins. */
  css?: string;
}

/** The onepager as a standalone HTML page. `link` links the brand's tokens, faces and favicon instead of
 * inlining them, as the specimen does, so a brand release leaves the page current. */
export async function composeOnepager(
  composer: Awaited<ReturnType<typeof openComposer>>,
  page: OnepagerPage,
  brand: string,
  link = false,
): Promise<string> {
  const SLOT = "\u0001";
  const cardTag = async (tint: boolean) => {
    const [open, close] = (await composer.render("DocCard", { tint }, { default: SLOT })).split(
      SLOT,
    );
    if (!open?.startsWith("<div ") || close?.trim() !== "</div>")
      throw new Error(`DocCard no longer wraps its slot in one <div>: ${open}${SLOT}${close}`);
    return open.trim();
  };
  const cards = { card: await cardTag(false), tint: await cardTag(true) };
  const body = (await composer.render("DocOnepager", { lang: page.lang, html: page.html })).replace(
    /<div class="([^"]*)"(?: data-astro-cid-\w+)?>/g,
    (tag, cls: string) => {
      const own = cls.split(" ");
      if (!own.includes("card")) return tag;
      const card = own.includes("tint") ? cards.tint : cards.card;
      const base = card.match(/class="([^"]*)"/)?.[1].split(" ") ?? [];
      const all = [...base, ...own.filter((c) => !base.includes(c))].join(" ");
      return card.replace(/class="[^"]*"/, `class="${all}"`);
    },
  );
  const style = [
    baseCss(brand, link),
    await composer.styles(),
    readFileSync(join(ROOT, "onepager.css"), "utf8"),
    page.css ?? "",
  ].join("\n");
  const bodyTag = page.bodyClass ? `<body class="${escapeHtml(page.bodyClass)}">` : "<body>";
  return `<!doctype html>
<html lang="${page.lang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(page.title)}</title>
${link ? linked(brand) : ""}<style>
${style}
</style>
</head>
${bodyTag}
${body.trim()}
</body>
</html>
`;
}
