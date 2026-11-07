import DocClosing from "../../../components/DocClosing.astro";
import { onSheet } from "../../sheet";

export default { component: DocClosing };

const closing = {
  text: "Wir freuen uns auf die Zusammenarbeit und melden uns zur Abstimmung der Termine.",
  signOff: "Viele Grüße",
  name: "Max Mustermann",
};
export const Offen = onSheet(closing);
export const Eng = onSheet({ ...closing, tight: true });
