import DocProse from "../../../components/DocProse.astro";
import { proseHtml } from "../../../scripts/samples";
import { onSheet } from "../../sheet";

export default { component: DocProse };

export const Fliesstext = onSheet({ html: proseHtml });
