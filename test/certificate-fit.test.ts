import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getViteConfig } from "astro/config";
import { createServer, type ViteDevServer } from "vite";
import { ROOT } from "../scripts/git";

// DocCertificate printed by headless Chrome, as os's generator prints it: every case fits one A4
// page with nothing past the content box, and content no fit step can hold prints a second page,
// which the generator refuses. The cases are the worst found across os's certificate ledger and
// curricula on 2026-10-29 (866 credentials: up to 14 topics, topics up to 120 characters, names
// wrapping onto two lines), with invented names.
const chrome =
  process.env.CHROME_BINARY ??
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].find((path) => existsSync(path));

const foundations = [
  "How LLMs and coding agents work in practice",
  "Development environment setup and configuration",
  "Effective prompting for software engineering tasks",
  "Project-level instructions and workflow configuration",
  "Context management for reliable agent sessions",
  "Subagent delegation and task specialization",
  "MCP- and CLI-based integration with external tools",
  "Feature implementation with coding agents",
  "Applying agentic workflows in day-to-day engineering",
];
const productEngineering = [
  "How LLMs and coding agents work in practice",
  "Development environment setup and configuration",
  "Effective prompting for software engineering tasks",
  "Project-level instructions and workflow configuration",
  "Permissions, security and hooks",
  "Context management and token strategies for reliable agent sessions",
  "Skills: reusable knowledge for coding agents",
  "Subagent delegation and task specialization",
  "MCP- and CLI-based integration with external tools",
  "Spec-driven development",
  "Feature implementation with coding agents",
  "Automated feedback loops: tests, hooks and browser checks as quality gates",
  "Human accountability and ownership when delegating to agents",
  "Applying agentic workflows in day-to-day engineering",
];
// The ledger's longest list: twelve topics of 46 to 103 characters, a title and its detail each.
const longTopics = [
  "Agentic systems at work: models, tools, the feedback loop between them and why it matters",
  "Context economics: context windows, token costs and subagents as protection for parallel work",
  "Instruction hierarchy: constitution, project instructions, rules and skills as reusable building blocks",
  "Permission models for tools and target systems, with hooks as enforced rules in the loop",
  "Building an agentic factory: stations, state carriers, bounded loops and their escalation",
  "Spec-driven development with OpenSpec: durable specs, change deltas and iteration to a viable spec",
  "Evidence classes for acceptance criteria and human gates: spec gate, deploy gate and the merge",
  "A slice through the existing chain: stage contracts and a status model with retry and escalation",
  "Operating models (local, CI, own runner): state, limits and costs",
  "Challenge station: test personas before the implementation, with a scope firewall",
  "Codify: friction signals, stable signatures, a learning log and evals for role prompts",
  "Prioritising by leverage, cut and risk",
];
const twoLineName = "Maximiliane Fassnacht-Ohnesorge";
const signer = (name: string) => ({ name, title: "Co-Founder, hackers&wizards", image: "" });
const certificate = (over: Record<string, unknown>) => ({
  lang: "en",
  title: "Certificate",
  attendeeName: "Jane Doe",
  attendeeCompany: "Example Company",
  trainingTitle: "hackers&wizards Training (2 Days)",
  trainingSubtitle: "Agentic Engineering for Developers and QA",
  date: "17 - 18 March 2026",
  remote: true,
  durationHours: "16",
  topics: foundations,
  signers: [signer("Stefan Munz"), signer("Benedikt Stemmildt")],
  credentialId: "HW-AE-DEV-260506-Q7M9X2K8V4N6P3D1",
  verificationUrl: "https://certificates.hackersandwizards.dev/c/HW-AE-DEV-260506-Q7M9X2K8V4N6P3D1",
  qrCodeUri: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  linkedinUrl: "https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME",
  ...over,
});
const productCourse = { trainingSubtitle: "Agentic Product Engineering" };
const fits: Record<string, Record<string, unknown>> = {
  // The ledger's most common certificate.
  "nine topics and a course name on one line": certificate({ trainingSubtitle: "" }),
  // The certificates skill's standard invocation.
  "nine topics and a course name on two lines": certificate({}),
  "a two-line name, nine topics": certificate({ attendeeName: twoLineName }),
  "a two-line name, eleven topics": certificate({
    ...productCourse,
    attendeeName: twoLineName,
    topics: productEngineering.slice(0, 11),
  }),
  "fourteen topics, the most in the ledger": certificate({
    ...productCourse,
    topics: productEngineering,
  }),
  "twelve long topics, the longest list in the ledger": certificate({
    lang: "de",
    trainingTitle: "hackers&wizards Workshop (2 Tage)",
    trainingSubtitle: "Agentic Factory",
    date: "01. - 02. September 2026",
    topics: longTopics,
  }),
  "twelve long topics and a two-line name": certificate({
    lang: "de",
    attendeeName: twoLineName,
    trainingTitle: "hackers&wizards Workshop (2 Tage)",
    trainingSubtitle: "Agentic Factory",
    topics: longTopics,
  }),
  "synthetic extreme: a two-line name, fourteen topics, a long course name": certificate({
    attendeeName: twoLineName,
    trainingTitle: "hackers&wizards Training (3 Days)",
    trainingSubtitle: "Agentic Product Engineering for Developers and QA",
    date: "17 - 19 September 2026",
    topics: productEngineering,
  }),
};
// Beyond any input on record: no fit holds fourteen topics of this length.
const overflowing = certificate({
  attendeeName: twoLineName,
  trainingSubtitle: "Agentic Product Engineering for Developers and QA",
  topics: [...longTopics, longTopics[0], longTopics[2]],
});

// The document base as os bakes it: imports inlined, faces as data URIs.
function inlineDocumentCss(path: string): string {
  const dir = dirname(path);
  return readFileSync(path, "utf8")
    .replace(/@import "@hackersandwizards\/brand\/([^"]+)";/g, (_, file: string) =>
      inlineDocumentCss(join(ROOT, "tokens", file)),
    )
    .replace(/@theme\s*\{/g, ":root {")
    .replace(
      /url\("(fonts\/[^"]+)"\)/g,
      (_, file: string) =>
        `url(data:font/woff2;base64,${readFileSync(join(dir, file)).toString("base64")})`,
    );
}

let server: ViteDevServer;
let dir: string;
beforeAll(async () => {
  const config = await getViteConfig(
    {
      root: ROOT,
      cacheDir: join(ROOT, "node_modules/.vite-test"),
      appType: "custom",
      logLevel: "error",
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    },
    { root: ROOT, configFile: false, logLevel: "silent", devToolbar: { enabled: false } },
  )({ command: "serve", mode: "development" });
  server = await createServer({ ...config, configFile: false });
  dir = mkdtempSync(join(tmpdir(), "certificate-fit-"));
});
afterAll(() => {
  server?.close();
  rmSync(dir, { recursive: true, force: true });
});

/** The case printed to PDF: its page count, and how far its content runs past the content box. */
async function printCertificate(props: Record<string, unknown>) {
  if (!chrome) throw new Error("Chrome or Chromium is required; set CHROME_BINARY");
  const { experimental_AstroContainer } = await server.ssrLoadModule("astro/container");
  const component = (await server.ssrLoadModule("/document/components/DocCertificate.astro"))
    .default;
  const container = await experimental_AstroContainer.create();
  const body = await container.renderToString(component, { props });
  const styles = [...server.moduleGraph.idToModuleMap.keys()].filter((id) =>
    id.includes("DocCertificate.astro?astro&type=style"),
  );
  const css: string[] = [];
  for (const id of styles)
    css.push((await server.ssrLoadModule(id.replace("&lang.css", "&inline&lang.css"))).default);
  // Runs after the component's own fit, which waits on the same promise.
  const probe = `<script>document.fonts.ready.then(() => {
    const cert = document.querySelector(".certificate");
    const box = cert.getBoundingClientRect();
    let bottom = 0;
    for (const el of cert.querySelectorAll("*")) bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
    const pre = document.createElement("pre");
    pre.id = "fit-probe";
    pre.textContent = String((bottom - (box.bottom - parseFloat(getComputedStyle(cert).paddingBottom))) * 0.75);
    document.body.append(pre);
  });</script>`;
  const html = (withProbe: boolean) =>
    `<!doctype html><html lang="${props.lang}"><head><meta charset="utf-8"><style>${inlineDocumentCss(
      join(ROOT, "document/document.css"),
    )}</style><style>${css.join("\n")}</style></head><body>${body.replace(/^<!DOCTYPE html>/i, "")}${
      withProbe ? probe : ""
    }</body></html>`;
  const page = join(dir, "certificate.html");
  const pdf = join(dir, "certificate.pdf");
  writeFileSync(page, html(false));
  // Its own profile, so it never attaches to a Chrome the user has open.
  const flags = [
    "--headless",
    "--disable-gpu",
    `--user-data-dir=${join(dir, "profile")}`,
    "--no-pdf-header-footer",
    "--print-background",
  ];
  execFileSync(chrome, [...flags, `--print-to-pdf=${pdf}`, `file://${page}`], { stdio: "ignore" });
  const pages = Number(
    execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)![1],
  );
  writeFileSync(page, html(true));
  const dom = execFileSync(
    chrome,
    [...flags, "--virtual-time-budget=10000", "--dump-dom", `file://${page}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const overPt = Number(dom.match(/<pre id="fit-probe">([^<]*)<\/pre>/)![1]);
  return { pages, overPt };
}

test.each(Object.keys(fits))(
  "%s fits one page, nothing clipped",
  async (name) => {
    const { pages, overPt } = await printCertificate(fits[name]!);
    expect(pages).toBe(1);
    expect(overPt).toBeLessThanOrEqual(0.5);
  },
  60_000,
);

test("content no fit holds prints a second page rather than clipping", async () => {
  expect((await printCertificate(overflowing)).pages).toBe(2);
}, 60_000);
