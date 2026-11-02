import DocHandout from "../../../components/DocHandout.astro";
import { handout } from "../../../scripts/samples";
import { onSheet } from "../../sheet";

export default { component: DocHandout };

export const Handout = onSheet({ ...handout, lang: "en" }, { pages: 4, sheet: "handout" });
