import DocTitle from "../../../components/DocTitle.astro";
import { onSheet } from "../../sheet";

export default { component: DocTitle };

export const Titel = onSheet({
  eyebrow: "Training für ein Team",
  title: "Agentic Engineering im Teamalltag",
  subtitle: "Zwei Tage, ein Team, ein eigener Workflow mit Agenten.",
});
