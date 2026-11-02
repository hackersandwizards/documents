import DocLeistungsnachweis from "../../../components/DocLeistungsnachweis.astro";
import {
  leistungsnachweisLumpSum,
  leistungsnachweisMonth,
  leistungsnachweisTraining,
} from "../../../scripts/samples";
import { onSheet } from "../../sheet";

export default { component: DocLeistungsnachweis };

export const Monat = onSheet(leistungsnachweisMonth);
export const Training = onSheet(leistungsnachweisTraining);
export const Pauschal = onSheet(leistungsnachweisLumpSum);
