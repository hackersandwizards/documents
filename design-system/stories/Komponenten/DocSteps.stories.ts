import DocSteps from "../../../components/DocSteps.astro";
import { onSheet } from "../../sheet";

export default { component: DocSteps };

export const Ablauf = onSheet({
  steps: [
    { when: "KW 46", name: "Klärung", text: "Ziele, Team und Rahmen in einem Gespräch." },
    { when: "KW 48", name: "Training", text: "Zwei Tage mit dem ganzen Team." },
    { when: "KW 52", name: "Rückblick", text: "Was hält, was fehlt." },
  ],
});
