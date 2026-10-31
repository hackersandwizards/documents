// Builds the one page that shows what needs a person, from every docs/tracking/decisions/items.js
// found under ~/dev (no repo list): Entscheiden (open rows with options), Prüfen (open rows
// without options), Erledigen (the person's GOAL.md rows, else TODO.md) and, collapsed, Annahmen
// (assumed rows). Agent work is left out. Answers stay in this browser until the row leaves the
// rebuilt page; "kopieren" puts them in one block for the chat. Usage:
// bun hub.ts [--check [<repo> ...]]   --check validates the found lists (or the given repos), exit 1 on a defect.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

// The one setting: where the page goes.
const PAGE =
  process.env.STAND_PAGE ?? join(homedir(), "Downloads", "stand-entscheidungen", "index.html");
const SCAN = join(homedir(), "dev");
const PEOPLE = ["Benedikt", "Stefan"]; // a row without `owner` is the first one's
const LIST = "docs/tracking/decisions/items.js";
const SKIP = new Set(["node_modules", "dist", "build", "target", "vendor", "venv", "coverage"]);

const hubEscape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const gitRead = (cwd: string, ...a: string[]) => {
  const r = Bun.spawnSync(["git", "-C", cwd, ...a], { stderr: "ignore" });
  return r.exitCode === 0 ? r.stdout.toString().trim() : "";
};

// Every repo once: dot folders (worktrees under .claude/worktrees) are not entered, and clones
// sharing an origin collapse into the one whose .git is a directory.
function findLists(dir: string, depth: number, out: string[]) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  if (entries.some((e) => e.name === ".git") && existsSync(join(dir, LIST))) out.push(dir);
  if (depth < 6)
    for (const e of entries)
      if (e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name))
        findLists(join(dir, e.name), depth + 1, out);
}
const args = process.argv.slice(2);
const checkOnly = args[0] === "--check";
let paths: string[];
if (checkOnly && args.length > 1) paths = args.slice(1).map((p) => resolve(p));
else {
  const found: string[] = [];
  findLists(SCAN, 0, found);
  const byRemote = new Map<string, string>();
  for (const p of found.sort()) {
    const remote = gitRead(p, "config", "--get", "remote.origin.url") || p;
    const had = byRemote.get(remote);
    if (
      !had ||
      (!statSync(join(had, ".git")).isDirectory() && statSync(join(p, ".git")).isDirectory())
    )
      byRemote.set(remote, p);
  }
  paths = [...byRemote.values()];
}

type Option = { key: string; label: string; detail?: string };
type Row = {
  id: string;
  title: string;
  status: string;
  priority: number;
  order: number;
  context: string;
  owner?: string;
  options?: Option[];
  recommended?: string;
  assumption?: string;
  detail?: string;
  images?: Record<string, string>;
  [k: string]: unknown;
};
type List = { path: string; key: string; rows: Row[] };
const lists: List[] = [];
const defects: string[] = [];
for (const path of paths) {
  const w: { DECISION_REPOS?: Record<string, Row[]> } = {};
  try {
    new Function("window", readFileSync(join(path, LIST), "utf8"))(w);
  } catch (e) {
    defects.push(`${path}/${LIST}: ${(e as Error).message}`);
    continue;
  }
  for (const [key, rows] of Object.entries(w.DECISION_REPOS ?? {})) lists.push({ path, key, rows });
}

const REQUIRED = ["id", "title", "area", "priority", "order", "status", "context"];
for (const { path, key, rows } of lists) {
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const at = `${key}:${r.id ?? `row ${i + 1}`}`;
    for (const k of REQUIRED)
      if (r[k] === undefined || r[k] === "") defects.push(`${at} lacks ${k}`);
    if (seen.has(r.id)) defects.push(`${at} duplicate id`);
    seen.add(r.id);
    if (!["open", "assumed", "decided"].includes(r.status))
      defects.push(`${at} status ${r.status}`);
    if (![1, 2, 3].includes(r.priority)) defects.push(`${at} priority ${r.priority}`);
    const keys = (r.options ?? []).map((o) => o.key);
    if (r.recommended && !keys.includes(r.recommended))
      defects.push(`${at} recommended not an option`);
    if (r.status === "decided" && !r.decision) defects.push(`${at} decided without decision`);
    for (const [k, file] of Object.entries(r.images ?? {})) {
      if (!keys.includes(k)) defects.push(`${at} image key ${k} is not an option`);
      if (!existsSync(join(path, file))) defects.push(`${at} image ${file} not found`);
    }
  });
}
if (checkOnly) {
  console.log(defects.length ? defects.join("\n") : `ok: ${lists.length} list(s)`);
  process.exit(defects.length ? 1 : 0);
}

// GOAL.md (else TODO.md) rows a person owns: a table line (Punkt | Owner | Beleg), a top-level
// "- " bullet with "Owner:", or an unticked "- [ ]", outside the goal and done-means sections.
// The owner starts with P1 to P3 and an optional ISO deadline, then whoever moves next.
type Task = {
  list: List;
  point: string;
  actor: string;
  evidence: string;
  prio: number;
  due?: string;
  who: string;
};
const tasks: Task[] = lists.flatMap((list) => {
  const file = ["GOAL.md", "TODO.md"].map((f) => join(list.path, f)).find(existsSync);
  if (!file) return [];
  const out: Task[] = [];
  let skip = file.endsWith("GOAL.md");
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("## ")) skip = /goal|ziel|done means|waiting/i.test(line);
    if (skip) continue;
    let point: string, owner: string, evidence: string;
    if (line.startsWith("|")) {
      [point, owner = "", evidence = ""] = line
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((c) => c.trim());
      if (!point || /^:?-+:?$/.test(point) || /^(punkt|item|point)$/i.test(point)) continue;
    } else if (/^- (?!\[x\])/i.test(line)) {
      const text = line.replace(/^- (\[ \] )?/, "");
      point = text.split(/ Owner: | Beleg: | Evidence: /)[0];
      owner = text.match(/Owner: ([^.]*)\./)?.[1] ?? "";
      evidence = text.match(/(?:Evidence|Beleg): (.*)$/)?.[1] ?? "";
    } else continue;
    const m = owner.match(/^P([1-3])\b\s*(\d{4}-\d{2}-\d{2})?[\s,:]*/);
    const actor = owner.slice(m?.[0].length ?? 0);
    const who = PEOPLE.find((p) => actor.startsWith(p));
    if (who)
      out.push({
        list,
        point,
        actor,
        evidence,
        prio: m ? +m[1] : 4,
        due: m?.[2],
        who,
      });
  }
  return out;
});

const fileHref = (path: string, file: string) => "file://" + encodeURI(resolve(path, file));
// Paths under docs/tracking/ in a row's text become links where the file exists.
const linkPaths = (path: string, text: unknown) =>
  hubEscape(text).replace(/(docs\/tracking\/[\w./äöü-]*\w)/g, (p) =>
    existsSync(join(path, p)) ? `<a href="${hubEscape(fileHref(path, p))}">${p}</a>` : p,
  );
const hubDate = (iso: string) => iso.split("-").reverse().join(".");
const rowOwner = (r: Row) => r.owner ?? PEOPLE[0];

// One <details> per point. Rows with options get radios (nothing preselected) and their images;
// every point gets a note field. data-k is the block's "repo:id".
function rowHtml(list: List, r: Row, kind: string) {
  const k = `${list.key}:${r.id}`;
  const opts = r.options ?? [];
  const choice = (o: Option) => {
    const img = r.images?.[o.key];
    return `<label class="opt${o.key === r.recommended ? " rec" : ""}">${img ? `<a class="pic" href="${hubEscape(fileHref(list.path, img))}" target="_blank"><img loading="lazy" src="${hubEscape(fileHref(list.path, img))}" alt="${hubEscape(o.label)}"></a>` : ""}<span class="choice"><input type="radio" name="${hubEscape(k)}" value="${hubEscape(o.key)}"> <span>${o.key === r.recommended ? '<span class="tag">Empfehlung</span> ' : ""}<b>${hubEscape(o.label)}</b>${o.detail ? ` <span class="note">${hubEscape(o.detail)}</span>` : ""}</span></span></label>`;
  };
  return `<details class="item" data-k="${hubEscape(k)}" data-who="${hubEscape(rowOwner(r))}" data-kind="${kind}"><summary><span class="p p${r.priority}">P${r.priority}</span><span class="t">${hubEscape(r.title)} <small>${hubEscape(list.key)}</small></span><span class="mark"></span></summary>
<div class="body">${r.assumption ? `<p class="recline"><b>Angenommen:</b> ${linkPaths(list.path, r.assumption)}</p>` : ""}<p>${linkPaths(list.path, r.context)}</p>${r.detail ? `<p class="note">${linkPaths(list.path, r.detail)}</p>` : ""}${
    opts.length
      ? `<div class="opts${Object.keys(r.images ?? {}).length ? " pics" : ""}">${opts.map(choice).join("")}</div>`
      : ""
  }<label class="lbl" for="n-${hubEscape(k)}">${opts.length ? "Notiz oder eigene Antwort" : "Antwort, etwa „passt“ oder was zu ändern ist"}</label><textarea id="n-${hubEscape(k)}"></textarea>
<p class="row-foot">${r.recommended ? `<button type="button" class="ghost pick" data-v="${hubEscape(r.recommended)}">Empfehlung wählen</button> ` : ""}<button type="button" class="ghost clear">Zurücksetzen</button> <span class="saved" aria-live="polite"></span></p></div></details>`;
}
function taskHtml(t: Task) {
  const k = `${t.list.key}:GOAL ${t.point.replace(/\s+/g, " ").slice(0, 60)}`;
  return `<details class="item" data-k="${hubEscape(k)}" data-who="${hubEscape(t.who)}" data-kind="task"><summary><span class="p p${Math.min(t.prio, 3)}">${t.prio < 4 ? `P${t.prio}` : "–"}</span><span class="t">${hubEscape(t.point.replace(/\s+/g, " ").slice(0, 160))}${t.point.length > 160 ? " …" : ""} <small>${hubEscape(t.list.key)}</small></span>${t.due ? `<span class="due">bis ${hubDate(t.due)}</span>` : ""}<span class="mark"></span></summary>
<div class="body"><p>${linkPaths(t.list.path, t.point)}</p><p><b>Wer:</b> ${hubEscape(t.actor)}</p>${t.evidence ? `<p class="note"><b>Beleg:</b> ${linkPaths(t.list.path, t.evidence)}</p>` : ""}<label class="choice"><input type="checkbox" value="erledigt"> erledigt</label><label class="lbl" for="n-${hubEscape(k)}">Notiz</label><textarea id="n-${hubEscape(k)}"></textarea><p class="row-foot"><button type="button" class="ghost clear">Zurücksetzen</button> <span class="saved" aria-live="polite"></span></p></div></details>`;
}

const all = lists.flatMap((list) => list.rows.map((r) => ({ list, r })));
const byPriority = (a: { r: Row }, b: { r: Row }) =>
  a.r.priority - b.r.priority || a.r.order - b.r.order;
const decide = all.filter(({ r }) => r.status === "open" && r.options?.length).sort(byPriority);
const check = all.filter(({ r }) => r.status === "open" && !r.options?.length).sort(byPriority);
const assumed = all.filter(({ r }) => r.status === "assumed");
tasks.sort((a, b) => a.prio - b.prio || (a.due ?? "9").localeCompare(b.due ?? "9"));
const groupHtml = (title: string, inner: string, open: boolean) =>
  inner
    ? `<details class="group"${open ? " open" : ""}><summary>${title}</summary>${inner}</details>`
    : "";
const partHtml = (id: string, title: string, note: string, inner: string) =>
  `<section class="part" id="${id}"><h2>${title} <span class="count" data-for="${id}"></span></h2><p class="note">${note}</p>${inner}<p class="note empty" hidden>Nichts offen.</p></section>`;
const decideHtml = [1, 2, 3]
  .map((p) => {
    const g = decide.filter(({ r }) => r.priority === p);
    return groupHtml(
      `Priorität ${p} <small>${g.length}</small>`,
      g.map(({ list, r }) => rowHtml(list, r, "decide")).join(""),
      p === 1,
    );
  })
  .join("");
const assumedHtml = lists
  .map((list) => {
    const g = assumed.filter((a) => a.list === list).sort(byPriority);
    return groupHtml(
      `${hubEscape(list.key)} <small>${g.length}</small>`,
      g.map(({ r }) => rowHtml(list, r, "assumed")).join(""),
      false,
    );
  })
  .join("");
const stamp = new Date().toLocaleString("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});
const fetchAge = (ms: number) => {
  const h = Math.round((Date.now() - ms) / 3.6e6);
  return h < 1
    ? "vor unter einer Stunde"
    : h < 48
      ? `vor ${h} h`
      : `vor ${Math.round(h / 24)} Tagen`;
};
const sources = lists
  .map(({ path, key }) => {
    const fetched = join(path, ".git", "FETCH_HEAD");
    const behind = Number(gitRead(path, "rev-list", "--count", "HEAD..@{u}") || 0);
    return `<li><b>${hubEscape(key)}</b> <span class="note">${hubEscape(path.replace(homedir(), "~"))} · geholt ${existsSync(fetched) ? fetchAge(statSync(fetched).mtimeMs) : "nie"}${behind ? ` · <span class="warn">${behind} Commits hinter origin</span>` : ""}</span></li>`;
  })
  .join("");
const ids = Object.fromEntries(
  all.map(({ list, r }) => [
    `${list.key}:${r.id}`,
    Object.fromEntries((r.options ?? []).map((o) => [o.key, o.label])),
  ]),
);

// Brand values come from @hackersandwizards/brand, pinned in ~/.claude/package.json (`bun install` there), through its exports:
// the tokens and print.css's font faces, inlined so the page opens offline from disk.
function brandCss() {
  const at = (f: string) => Bun.resolveSync(`@hackersandwizards/brand/${f}`, import.meta.dir);
  const faces = readFileSync(at("print.css"), "utf8").match(/@font-face\s*{[^}]*}/g);
  if (!faces) throw new Error("brand print.css: no @font-face");
  const inline = (face: string) =>
    face.replace(/url\("fonts\/([^"]+)"\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(at(`fonts/${f}`)).toString("base64")})`);
  return [readFileSync(at("tokens.root.css"), "utf8"), ...faces.map(inline)].join("\n");
}

mkdirSync(dirname(PAGE), { recursive: true });
writeFileSync(
  PAGE,
  `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Was dich braucht</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${brandCss()}
/* Page roles on brand tokens. Dark follows the system, on the night tones: teal-night accent with night text on it. */
:root{--bg:var(--color-bg);--surface:var(--color-white);--on-accent:var(--color-white);--ink:var(--color-ink);--muted:var(--color-muted);--line:var(--color-border);--tint:var(--color-tint);--accent:var(--color-teal);--accent-2:var(--color-purple);--error:color-mix(in srgb,var(--color-red) 70%,var(--color-ink));--warning:color-mix(in srgb,var(--color-amber-dark) 70%,var(--color-ink));
--text-page:1.5rem;--text-heading:1.25rem;--text-subheading:1rem;--text-ui:.875rem;--text-micro:.75rem;color-scheme:light;
--field-line:color-mix(in srgb,var(--muted) 70%,var(--bg))/* field borders at 3:1, the non-text minimum */}
@media (prefers-color-scheme:dark){:root{--bg:var(--color-night);--surface:var(--color-night-2);--on-accent:var(--color-night);--ink:var(--color-night-ink);--muted:var(--color-night-muted);
--line:color-mix(in srgb,white 18%,var(--color-night));--tint:color-mix(in srgb,white 7%,var(--color-night-2));
--accent:var(--color-teal-night);--accent-2:var(--color-purple-night);--error:var(--color-red-night);--warning:var(--color-amber);color-scheme:dark}}
[hidden]{display:none!important}
:focus-visible{outline:3px solid var(--accent-2);outline-offset:2px}
body{font:var(--text-subheading)/1.5 var(--font-sans);color:var(--ink);background:var(--bg);margin:0}
main{max-width:1040px;margin:0 auto;padding:0 24px 64px;overflow-wrap:anywhere}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-top:3px solid;border-image:var(--gradient-magic) 1;border-bottom:1px solid var(--line);padding:10px 0 8px}
.top{display:flex;gap:8px 16px;align-items:center;flex-wrap:wrap}
h1,h2,summary,button{font-family:var(--font-mono);font-weight:600;margin:0}
h1{font-size:var(--text-page)}
#state{font-size:var(--text-ui);margin:0;flex:1;color:var(--muted)}
.row2{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin-top:6px}.bar{display:contents}.jump{order:1}.find{order:2;display:flex;gap:6px;align-items:center}
.jump .count{color:inherit;margin-left:4px}
.who{display:flex;gap:4px;align-items:center;font-size:var(--text-ui)}
.who button{background:var(--surface);color:var(--ink);border:1px solid var(--field-line);border-radius:var(--radius-pill);padding:0 14px;min-height:44px;font-size:var(--text-ui)}
.who button[aria-pressed=true]{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.jump{display:flex;gap:2px;font:500 var(--text-ui) var(--font-mono);overflow-x:auto;white-space:nowrap;scrollbar-width:none}
.jump a{display:inline-flex;align-items:center;min-height:44px;text-decoration:none;padding:0 10px;border-radius:var(--radius-pill)}
.jump a[aria-current]{background:var(--accent);color:var(--on-accent)}
input[type=search]{font:inherit;font-size:var(--text-ui);width:150px;min-height:44px;box-sizing:border-box;padding:0 10px;border:1px solid var(--field-line);border-radius:var(--radius-sm);background:var(--surface);color:var(--ink)}
#hits{font-size:var(--text-micro);color:var(--muted)}#hits:empty{display:none}
button{font-size:var(--text-ui);background:var(--accent);color:var(--on-accent);border:0;border-radius:var(--radius-sm);padding:0 16px;min-height:44px;cursor:pointer}
button.ghost{background:none;color:var(--accent);border:1px solid var(--accent);min-height:44px;padding:0 12px}
h2{font-size:var(--text-heading);margin:28px 0 4px;color:var(--accent)}
.count{font-size:var(--text-ui);color:var(--muted);font-weight:400}
small{color:var(--muted);font-weight:400;font-size:var(--text-micro);margin-left:6px}
section.part,details.item{scroll-margin-top:130px}
details.group{margin:8px 0}
details.group>summary{font-size:var(--text-subheading);padding:10px 0;cursor:pointer;min-height:24px}
details.item{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);margin-bottom:6px}
details.item>summary{display:flex;gap:10px;align-items:flex-start;list-style:none;font:500 var(--text-subheading)/1.4 var(--font-sans);padding:11px 12px;cursor:pointer}
details.item>summary::-webkit-details-marker{display:none}
details.item>summary .t{flex:1}
details.item>summary .t::before{content:"";display:inline-block;border-left:7px solid var(--accent);border-top:5px solid transparent;border-bottom:5px solid transparent;margin-right:10px;vertical-align:1px;transition:transform .15s}
details.item[open]>summary .t::before{transform:rotate(90deg)}
.p{font:600 var(--text-micro) var(--font-mono);padding:2px 7px;border-radius:var(--radius-pill);margin-top:2px}
.p1{color:var(--error);background:color-mix(in srgb,var(--error) 15%,transparent)}.p2{color:var(--warning);background:color-mix(in srgb,var(--warning) 15%,transparent)}.p3{color:var(--muted);background:var(--tint)}
.mark{font-size:var(--text-micro);color:var(--accent);white-space:nowrap;margin-top:3px}
.due{font:600 var(--text-micro) var(--font-mono);color:var(--accent-2);white-space:nowrap;margin-top:3px}
details.item .body{padding:0 12px 12px;font-size:var(--text-ui)}
.recline{background:var(--tint);border-radius:var(--radius-sm);padding:8px 10px}
.opts{display:grid;gap:8px;margin:8px 0}.opts.pics{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.opt{display:block;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;cursor:pointer}
.opt:has(input:checked){border:2px solid var(--accent);padding:7px 9px}
.choice{display:flex;gap:8px;align-items:flex-start;min-height:28px}
.choice input{width:20px;height:20px;margin:1px 0 0;flex:none;accent-color:var(--accent)}
.pic img{display:block;width:100%;max-height:200px;object-fit:contain;background:var(--tint);border-radius:var(--radius-sm);margin-bottom:6px}
.tag{font-size:var(--text-micro);background:var(--accent);color:var(--on-accent);padding:1px 8px;border-radius:var(--radius-pill)}
.lbl{display:block;margin-top:8px;font-size:var(--text-micro);color:var(--muted)}
textarea{width:100%;box-sizing:border-box;min-height:44px;font:inherit;font-size:var(--text-ui);border:1px solid var(--field-line);border-radius:var(--radius-sm);padding:8px;background:var(--surface);color:var(--ink)}
.row-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.saved{font-size:var(--text-micro);color:var(--muted)}
p{margin:6px 0}a{color:var(--accent)}.note{color:var(--muted);font-size:var(--text-ui)}.warn{color:var(--error)}
#block{width:100%;min-height:120px;font:var(--text-micro)/1.5 var(--font-mono)}
.sources summary{font:var(--text-ui) var(--font-sans);color:var(--muted);cursor:pointer;padding:6px 0}
.sources ul{margin:0;padding-left:20px;font-size:var(--text-ui)}
@media (max-width:640px){main{padding:0 14px 48px}
/* On the phone only the jump bar stays: header and bar dissolve so it sticks to main. */
header,.row2{display:contents}.top{padding-top:12px;border-top:3px solid;border-image:var(--gradient-magic) 1;margin:0 -14px;padding-inline:14px}
h1{font-size:var(--text-heading);flex:1}#state{flex-basis:100%;order:3}
.bar{display:flex;gap:6px;margin-top:6px}.find{flex:1;min-width:0}.find input{flex:1;width:auto;min-width:0}.who button{padding:0 10px}
.jump{position:sticky;top:0;z-index:2;background:var(--bg);margin:6px -14px 0;padding:0 8px;box-shadow:0 6px 8px -6px rgb(0 0 0/.3);mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent)}.jump a{padding:0 7px}
section.part,details.item{scroll-margin-top:120px}.opts.pics{grid-template-columns:1fr}}
</style></head><body><main>
<header><div class="top"><h1>Was dich braucht</h1><p id="state" role="status"></p><button id="copy" type="button">Antworten kopieren</button></div>
<div class="row2"><div class="bar"><div class="who" role="group" aria-label="Für wen">${[...PEOPLE, "alle"].map((p) => `<button type="button" data-who="${p}" aria-pressed="false">${p}</button>`).join("")}</div>
<div class="find"><input type="search" id="q" placeholder="Filtern" aria-label="Punkte filtern"><span id="hits" aria-live="polite"></span></div></div>
<nav class="jump" aria-label="Abschnitte"><a href="#entscheiden">Entscheiden <span class="count" data-for="entscheiden"></span></a><a href="#pruefen">Prüfen <span class="count" data-for="pruefen"></span></a><a href="#erledigen">Erledigen <span class="count" data-for="erledigen"></span></a><a href="#annahmen">Annahmen <span class="count" data-for="annahmen"></span></a></nav>
</div></header>
<details class="sources"><summary>${lists.length} Entscheidungslisten unter ~/dev, gebaut ${hubEscape(stamp)}</summary><ul>${sources}</ul>
<p class="note">Wähle, schreib eine Notiz, oder hake ab: alles bleibt in diesem Browser. „Antworten kopieren“ legt alles als einen Block in die Zwischenablage; füg ihn in den Chat mit Ada ein. Ada trägt jede Zeile in ihr Repo ein, committet, baut die Seite neu und bestätigt jede id. Eine Antwort verschwindet hier, wenn ihre Zeile von der neuen Seite verschwindet. Fehlt ein Repo in der Liste, liegt es nicht unter ~/dev oder hat keine Entscheidungsliste.</p>
<label class="lbl" for="block">Der Block zum Kopieren</label><textarea id="block" readonly></textarea></details>
${partHtml("entscheiden", "Entscheiden", "Eine Frage mit Optionen. Nichts ist vorausgewählt.", decideHtml)}
${partHtml("pruefen", "Prüfen", "Ansehen und antworten: „passt“ oder was zu ändern ist.", check.map(({ list, r }) => rowHtml(list, r, "check")).join(""))}
${partHtml("erledigen", "Erledigen", "Deine Aufgaben aus GOAL.md. Abhaken, wenn erledigt.", tasks.map(taskHtml).join(""))}
${partHtml("annahmen", "Annahmen", "Was Agenten selbst entschieden haben. Musst du nicht durchgehen; wähle eine andere Option nur, wenn du eine kippen willst.", assumedHtml)}
</main>
<script>
// Option labels per "repo:id", so the block names each choice.
const IDS = ${JSON.stringify(ids).replace(/</g, "\\u003c")};
const STORE = "stand-k6:";
const read = (k) => { try { return JSON.parse(localStorage.getItem(STORE + k)) || null; } catch (e) { return null; } };
const write = (k, v) => { try { v ? localStorage.setItem(STORE + k, JSON.stringify(v)) : localStorage.removeItem(STORE + k); return true; } catch (e) { return false; } };
const items = [...document.querySelectorAll("details.item")];
const known = new Set(items.map((d) => d.dataset.k));
// An answer whose row left the page was carried out: drop it.
for (let i = localStorage.length - 1; i >= 0; i--) {
  const k = localStorage.key(i);
  if (k.startsWith(STORE) && k !== STORE + "who" && k !== STORE + "copied" && !known.has(k.slice(STORE.length))) localStorage.removeItem(k);
}
const hhmm = (iso) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
function load(d) {
  const a = read(d.dataset.k);
  for (const i of d.querySelectorAll("input")) i.checked = !!a && (i.type === "radio" ? a.option === i.value : !!a.done);
  d.querySelector("textarea").value = a ? a.note || "" : "";
  mark(d, a);
}
function mark(d, a) {
  const label = a && (a.option ? (IDS[d.dataset.k] || {})[a.option] || a.option : a.done ? "erledigt" : a.note ? "Notiz" : "");
  d.querySelector(".mark").textContent = label ? "✓ " + label : "";
  d.querySelector(".saved").textContent = a ? "gespeichert " + hhmm(a.at) : "";
}
function save(d) {
  const opt = d.querySelector("input[type=radio]:checked");
  const done = d.querySelector("input[type=checkbox]:checked");
  const note = d.querySelector("textarea").value.trim();
  const a = opt || done || note ? { option: opt ? opt.value : "", done: !!done, note, at: new Date().toISOString() } : null;
  if (!write(d.dataset.k, a)) d.querySelector(".saved").textContent = "Nicht gespeichert: der Browser sperrt den Speicher";
  else mark(d, a);
  state();
}
for (const d of items) {
  load(d);
  d.addEventListener("change", () => save(d));
  d.querySelector("textarea").addEventListener("input", () => save(d));
  const pick = d.querySelector(".pick");
  if (pick) pick.addEventListener("click", () => { d.querySelector('input[value="' + CSS.escape(pick.dataset.v) + '"]').checked = true; save(d); });
  d.querySelector(".clear").addEventListener("click", () => { write(d.dataset.k, null); load(d); state(); });
}
const answered = () => items.filter((d) => read(d.dataset.k));
function block() {
  const lines = answered().map((d) => {
    const a = read(d.dataset.k);
    const choice = a.option ? a.option + " (" + ((IDS[d.dataset.k] || {})[a.option] || "") + ")" : a.done ? "erledigt" : "";
    return d.dataset.k + ": " + [choice, a.note.replace(/\\s+/g, " ")].filter(Boolean).join(", ");
  });
  return lines.length ? "Antworten von der Seite „Was dich braucht“:\\n" + lines.join("\\n") : "";
}
// Answers changed since the last copy have not reached Ada.
const uncopied = () => { const c = localStorage.getItem(STORE + "copied") || ""; return answered().filter((d) => read(d.dataset.k).at > c).length; };
function state() {
  const n = answered().length, open = uncopied();
  document.getElementById("copy").textContent = n ? n + (n === 1 ? " Antwort" : " Antworten") + " kopieren" : "Antworten kopieren";
  document.getElementById("state").textContent = !n
    ? "Wähle direkt an der Zeile. Antworten bleiben in diesem Browser, bis du sie kopierst und in den Chat mit Ada einfügst; Ada bestätigt jede mit Commit."
    : open
      ? open + " noch nicht kopiert, nur in diesem Browser. Kopieren, in den Chat mit Ada einfügen; Ada bestätigt jede mit Commit."
      : "Alles kopiert um " + hhmm(localStorage.getItem(STORE + "copied")) + ". Eine Antwort verschwindet hier, wenn Ada sie eingetragen hat.";
  document.getElementById("block").value = block();
}
addEventListener("beforeunload", (e) => { if (uncopied()) e.preventDefault(); });
document.getElementById("copy").addEventListener("click", async () => {
  const text = block();
  const btn = document.getElementById("copy");
  if (!text) { btn.textContent = "Noch nichts gewählt"; setTimeout(state, 1500); return; }
  try { await navigator.clipboard.writeText(text); }
  catch (e) { const t = document.getElementById("block"); t.closest("details").open = true; t.select(); document.execCommand("copy"); }
  try { localStorage.setItem(STORE + "copied", new Date().toISOString()); } catch (e) {}
  state();
  btn.textContent = "Kopiert: in den Chat einfügen";
  setTimeout(state, 2500);
});
// Person filter and text filter; counts follow what is visible.
let who = localStorage.getItem(STORE + "who") || ${JSON.stringify(PEOPLE[0])};
const q = document.getElementById("q");
function apply() {
  const term = q.value.trim().toLowerCase();
  let hits = 0;
  for (const d of items) {
    d.hidden = (who !== "alle" && d.dataset.who !== who) || (!!term && !d.textContent.toLowerCase().includes(term));
    if (!d.hidden) hits++;
  }
  for (const g of document.querySelectorAll("details.group")) {
    const shown = g.querySelectorAll("details.item:not([hidden])").length;
    g.hidden = !shown;
    g.querySelector("summary small").textContent = shown;
    if (term && shown) g.open = true;
  }
  for (const s of document.querySelectorAll(".count[data-for]")) s.textContent = document.querySelectorAll("#" + s.dataset.for + " details.item:not([hidden])").length;
  for (const p of document.querySelectorAll("section.part")) p.querySelector(".empty").hidden = !!p.querySelector("details.item:not([hidden])");
  for (const b of document.querySelectorAll(".who button")) b.setAttribute("aria-pressed", b.dataset.who === who);
  document.getElementById("hits").textContent = term ? hits + " Treffer" : "";
  current();
}
for (const b of document.querySelectorAll(".who button")) b.addEventListener("click", () => { who = b.dataset.who; try { localStorage.setItem(STORE + "who", who); } catch (e) {} apply(); });
q.addEventListener("input", apply);
// Jump bar: the section under the bar is the filled pill.
const header = document.querySelector("header"), jump = document.querySelector(".jump"), links = [...jump.querySelectorAll("a")];
let shown;
function current() {
  const edge = Math.max((matchMedia("(max-width:640px)").matches ? jump : header).getBoundingClientRect().bottom + 8, innerHeight * 0.3);
  let at = links[0];
  for (const l of links) { const s = document.querySelector(l.getAttribute("href")); if (s.getBoundingClientRect().top <= edge) at = l; }
  if (at === shown) return;
  shown = at;
  for (const l of links) l.toggleAttribute("aria-current", l === at);
  jump.scrollLeft = at.offsetLeft - (jump.clientWidth - at.offsetWidth) / 2;
}
let queued = false;
addEventListener("scroll", () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; current(); }); });
addEventListener("storage", () => { for (const d of items) load(d); state(); });
apply();
state();
</script></body></html>
`,
);
console.log(
  `${PAGE}: ${lists.length} lists (${lists.map((l) => l.key).join(", ")}); ${decide.length} to decide, ${check.length} to check, ${tasks.length} tasks, ${assumed.length} assumed`,
);
