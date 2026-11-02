// The onepager is composed by composeOnepager on its own stylesheet, DocCard's tag set on each card
// of its HTML body, the path every consumer takes: served as it writes it, the brand files linked
// beside it.
import type { APIRoute } from "astro";
import { openComposer } from "../../../../scripts/compose";
import { composeOnepager } from "../../../../scripts/onepager";
import { ROOT } from "../../../../scripts/root";
import { onepager } from "../../../../scripts/samples";

export const GET: APIRoute = async () => {
  const composer = await openComposer(ROOT);
  try {
    return new Response(
      await composeOnepager(
        composer,
        onepager,
        "../../node_modules/@hackersandwizards/brand",
        true,
      ),
    );
  } finally {
    await composer.close();
  }
};
