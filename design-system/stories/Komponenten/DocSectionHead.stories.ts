import DocSectionHead from "../../../components/DocSectionHead.astro";
import { onSheet } from "../../sheet";

export default { component: DocSectionHead };

export const Abschnitt = onSheet({ label: "Leistungen", title: "Was das Training umfasst" });
