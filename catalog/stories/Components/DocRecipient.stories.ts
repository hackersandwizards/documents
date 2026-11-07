import DocRecipient from "../../../components/DocRecipient.astro";
import { onSheet } from "../../sheet";

export default { component: DocRecipient };

export const Empfaenger = onSheet({
  label: "Erstellt für",
  company: "Musterwerk AG",
  lines: ["Erika Mustermann", "Beispielweg 12", "12345 Musterstadt"],
  contact: { label: "Ansprechpartner", name: "Max Mustermann" },
});
