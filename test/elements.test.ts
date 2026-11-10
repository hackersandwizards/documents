import { expect, test } from "bun:test";
import { withElements } from "../scripts/elements";
import { TYPES } from "../catalog/types";
import config from "../brand-elements.json";

test("each engine class takes its brand element and variant, once", () => {
  const html =
    '<span class="doc-tag">Angebot</span><div class="note"><span class="label">Kurz</span></div><div class="callout outcome">x</div><a href="#">l</a><a class="own" href="#">o</a><pre><code>c</code></pre><blockquote>q</blockquote><aside class="margin-note">m</aside>';
  const out = withElements(html);
  expect(out).toBe(
    '<span class="doc-tag hw-pill" data-caps="">Angebot</span><div class="note hw-callout"><span class="label hw-label" data-tone="muted">Kurz</span></div><div class="callout outcome hw-callout" data-hue="purple">x</div><a href="#" class="hw-link">l</a><a class="own" href="#">o</a><pre class="hw-code"><code>c</code></pre><blockquote class="hw-quote" data-tone="muted">q</blockquote><aside class="margin-note" data-hw-exception="margin-note">m</aside>',
  );
  expect(withElements(out)).toBe(out);
});

// brand-elements measures every type page; the survey readout's slides are an exception it lists.
test("brand-elements measures every type page but the survey readout's", () => {
  const measured = TYPES.filter((t) => t.file !== "survey-readout").map(
    (t) => `dist/types/${t.file}/index.html`,
  );
  expect([...config.pages].sort()).toEqual(measured.sort());
  expect(Object.keys(config.exceptions)).toContain("survey-readout");
});
