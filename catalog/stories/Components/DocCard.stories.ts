import DocCard from "../../../components/DocCard.astro";
import Slotted from "../../Slotted.astro";
import { onSheet } from "../../sheet";

export default { component: Slotted };

const html = "<p>Zwei Tage mit dem ganzen Team, am eigenen Code.</p>";
export const Karte = onSheet({ of: DocCard, title: "Training", meta: "Zwei Tage", html });
export const Getoent = onSheet({
  of: DocCard,
  title: "Erstellt für Musterwerk AG",
  tint: true,
  html,
});
export const Klein = onSheet({ of: DocCard, title: "Community", small: true, dense: true, html });
