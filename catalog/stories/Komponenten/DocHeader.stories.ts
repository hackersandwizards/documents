import DocHeader from "../../../components/DocHeader.astro";
import { onSheet } from "../../sheet";

export default { component: DocHeader };

export const Angebot = onSheet({
  kind: "Angebot",
  meta: ["2. November 2026", "Gültig bis 2. Dezember 2026"],
});
export const Mit_Impressum = onSheet({ kind: "Honorarsätze", legal: true });
