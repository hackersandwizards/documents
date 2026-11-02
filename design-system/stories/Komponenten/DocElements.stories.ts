import DocElements from "../../../components/DocElements.astro";
import Slotted from "../../Slotted.astro";
import { onSheet } from "../../sheet";

export default { component: Slotted };

// The engine's own classes in a consumer's markup, which DocElements gives the brand's elements.
export const Elemente = onSheet({
  of: DocElements,
  html: `<span class="eyebrow">Training für ein Team</span>
<p><span class="doc-tag">Angebot</span> <span class="chip">Remote</span></p>
<div class="card"><h4>Über hackers&amp;wizards</h4></div>
<div class="callout"><span class="label">Kurz gesagt</span><p>Ein Satz.</p></div>
<blockquote><p>„Der Plan stand, bevor die erste Zeile Code lief.“</p></blockquote>
<table><thead><tr><th>Leistung</th><th>Basis</th></tr></thead><tbody><tr><td>Training</td><td>2 Tage</td></tr></tbody></table>
<p>Dann öffnet ihr <a href="https://example.com/">localhost:3000</a>.</p>
<pre><code>bun run check</code></pre>`,
});
