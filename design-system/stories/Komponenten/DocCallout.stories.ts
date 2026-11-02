import DocCallout from "../../../components/DocCallout.astro";
import Slotted from "../../Slotted.astro";
import { onSheet } from "../../sheet";

export default { component: Slotted };

export const Ergebnis = onSheet({
  of: DocCallout,
  title: "Ergebnis",
  html: "<p>Ein Team, das Agenten steuert, statt ihnen hinterherzuräumen.</p>",
});
