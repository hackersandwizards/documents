import DocSignatures from "../../../components/DocSignatures.astro";
import { onSheet } from "../../sheet";

export default { component: DocSignatures };

export const Unterschriften = onSheet({
  signatures: [
    { label: "Auftraggeber", party: "Musterwerk AG", name: "Erika Mustermann" },
    { label: "Auftragnehmer", party: "hackers&wizards GmbH", name: "Max Mustermann" },
  ],
  placeDate: "Ort, Datum",
  signature: "Unterschrift {name}",
});
