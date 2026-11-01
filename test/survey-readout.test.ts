import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromeBinary } from "../scripts/render-pdf";
import { surveyReadout } from "../scripts/samples";
import { composeSurveyReadout } from "../scripts/survey-readout";

test("a mark colour cannot open an attribute", () => {
  const weak = surveyReadout.readout.weak;
  const html = composeSurveyReadout({
    ...surveyReadout,
    readout: { ...surveyReadout.readout, weakColors: weak.map(() => 'red" onmouseover="x') },
  });
  expect(html).not.toContain('" onmouseover=');
  expect(html).toContain("--mark:red&quot; onmouseover=&quot;x");
});

// A free-text page a few pixels too full squeezed its kicker, a flex item of fixed height, and the
// title rose 3px on that slide alone (os, Bünting readout, 01.11.). Twelve invented answers of these
// lengths reproduce it in Chrome; every slide's title must sit at the same height.
test("every slide's title sits at the same height", () => {
  const chrome = chromeBinary();
  if (!chrome) throw new Error("Chrome for Testing is required; set CHROME_BINARY");
  const words = "the review loop on our own codebase made the difference and the exercises fit";
  const answer = (k: number) =>
    `An invented answer: ${Array.from({ length: k }, (_, i) => words.split(" ")[i % 14]).join(" ")}.`;
  const liked = Array.from({ length: 12 }, (_, i) => answer(6 + ((i * 7) % 23)));
  // Runs after the page's own fit guard, which is the first load listener.
  const probe = `<script>addEventListener("load", () => {
    const pre = document.createElement("pre");
    pre.id = "probe";
    pre.textContent = [...document.querySelectorAll(".slide h2")].map((h) => h.getBoundingClientRect().top - h.closest(".slide").getBoundingClientRect().top).join(" ");
    document.body.append(pre);
  });</script>`;
  const dir = mkdtempSync(join(tmpdir(), "survey-readout-"));
  try {
    const page = join(dir, "readout.html");
    writeFileSync(
      page,
      composeSurveyReadout({ ...surveyReadout, liked }).replace("</body>", `${probe}</body>`),
    );
    const dom = execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--use-mock-keychain",
        "--password-store=basic",
        `--user-data-dir=${join(dir, "profile")}`,
        "--window-size=1280,720",
        "--virtual-time-budget=10000",
        "--dump-dom",
        `file://${page}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const tops = dom.match(/<pre id="probe">([^<]*)<\/pre>/)![1]!.split(" ");
    expect(tops).toHaveLength(6);
    expect(new Set(tops).size).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
