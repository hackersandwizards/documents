import DocPreparation from "../../../components/DocPreparation.astro";
import { preparation } from "../../../scripts/samples";
import { onSheet } from "../../sheet";

export default { component: DocPreparation };

export const Vorbereitung = onSheet(preparation);
