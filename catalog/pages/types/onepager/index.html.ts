import type { APIRoute } from "astro";
import { openComposer } from "../../../../scripts/compose";
import { composeOnepager } from "../../../../scripts/onepager";
import { ROOT } from "../../../../scripts/root";
import { NOINDEX } from "@hackersandwizards/scaffolding/catalog/robots.ts";
import { brandHref } from "../../../brand";
import { onepager } from "../../../../scripts/samples";

export const GET: APIRoute = async () => {
  const composer = await openComposer(ROOT);
  try {
    return new Response(
      (await composeOnepager(composer, onepager, brandHref)).replace(
        "</head>",
        `${NOINDEX}</head>`,
      ),
    );
  } finally {
    await composer.close();
  }
};
