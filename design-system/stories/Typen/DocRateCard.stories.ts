import DocRateCard from "../../../components/DocRateCard.astro";
import { rateCard } from "../../../scripts/samples";
import { onSheet } from "../../sheet";

export default { component: DocRateCard };

export const Honorarsaetze = onSheet(rateCard);
