import DocLead from "../../../components/DocLead.astro";
import Slotted from "../../Slotted.astro";
import { onSheet } from "../../sheet";

export default { component: Slotted };

export const Einstieg = onSheet({
  of: DocLead,
  html: "<p>Euer Team nutzt Agenten schon im Alltag. Was fehlt, ist ein gemeinsamer Weg, sie zu steuern.</p>",
  aside:
    '<div class="prepared"><span class="label">Erstellt für</span><strong>Musterwerk AG</strong><br />Erika Mustermann</div>',
});
