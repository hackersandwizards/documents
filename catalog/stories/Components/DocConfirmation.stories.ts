import DocConfirmation from "../../../components/DocConfirmation.astro";
import { onSheet } from "../../sheet";

export default { component: DocConfirmation };

export const Bestaetigung = onSheet({
  label: "Bestätigung",
  text: "Die oben aufgeführten Stunden bestätigt der Auftraggeber per Mail.",
  line: "Bestätigt per Mail am",
});
