import DocOnepager from "../../../components/DocOnepager.astro";
import { onepager } from "../../../scripts/samples";
import { onSheet } from "../../sheet";

export default { component: DocOnepager };

export const Onepager = onSheet(onepager, { pages: 2, sheet: "onepager" });
