#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as samples from "./samples";

const ROOT = resolve(import.meta.dir, "..");

const MAIL_DOMAINS = /^(hackersandwizards\.dev|example\.(com|org|net|de))$/i;
const STREETS = new Set(["Osterstraße 95", "Beispielweg 12", "Example Road 12"]);
// Every word a person or client in the samples' props may carry: invented, our own company, or a
// salutation's opener.
const INVENTED = new Set(
  "Mara Beispiel Jonas Probst Erika Max Mustermann Musterwerk AG Ltd GmbH hackers&wizards Partner Hallo Dear".split(
    " ",
  ),
);
const PERSON_KEYS =
  /^(personName|recipientName|recipientFirstName|attendeeName|attendeeCompany|employee|contact|company|client|clientShort|shortName|customerName|counterparty|party|salutation)$/;
// A key holding a name only at a place: a signer's name, an address's first line, a certificate
// title's attendee after its colon.
const personAt = (path: string, key: string) =>
  (key === "name" && /\b(signers|signatures)\[/.test(path)) ||
  /\.(client|recipient)\.lines\[0\]$/.test(path) ||
  /^certificate\w*\.title$/.test(path);

const RULES: { what: string; pattern: RegExp; allowed?: (match: string) => boolean }[] = [
  {
    what: "a euro figure that is not a placeholder",
    // A gap may be a space or an HTML no-break space, € an entity, the scale k, T, Mio. or Mrd.
    pattern:
      /\d[\d.,]*(?:,[-–])?(?:\s|&nbsp;|&#160;)?(?:[kT]|Mio\.|Mrd\.)?(?:\s|&nbsp;|&#160;)?(?:€|&euro;|EUR\b|Euros?\b)|(?:€|&euro;|\bEUR|\bEuro)(?:\s|&nbsp;|&#160;)?\d/gi,
  },
  {
    what: "a mail address outside the example domains and ours",
    // Not before a colon and a path or quote: git@host:org/repo is an SSH remote, no mailbox.
    pattern: /[\w.+-]+@((?:[\w-]+\.)+[a-z]{2,})(?![\w.-]*:[\w"'/~])/gi,
    allowed: (m) => MAIL_DOMAINS.test(m.split("@")[1]),
  },
  {
    what: "a phone number",
    pattern:
      /(?<!\w)\+\d{2}[\s/-]?(?:\(0\)\s?)?\(?0?\d{2,5}\)?[\s/-]?\d{3,}|(?<![\w.,])\(?0\d{2,4}\)?(?: ?[/-] ?|\s)?\d{5,}|(?<![\w.,])0\d{2,4}(?: ?[/-] ?|\s)[1-9]\d{1,3}(?:\s\d{2,4})+/g,
  },
  // Any country in capitals; a German one in lower case too, which a hash cannot pass for.
  {
    what: "an IBAN",
    pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z\d]{4}){3,}|\bde\d{2}(?: ?\d{4}){4} ?\d{2}\b/g,
  },
  {
    what: "a street address",
    pattern:
      // A lookbehind, since \b knows no umlaut even under /u.
      /(?<![\p{L}\p{N}])\p{Lu}[\p{L}-]*(?:straße|strasse|str\.|weg|gasse|allee|platz|damm|ring|chaussee|stieg|kamp|deich|ufer|kai)\s+\d+|(?<![\p{L}\p{N}])\p{Lu}\p{L}+ (?:Straße|Strasse|Weg|Gasse|Allee|Platz|Damm|Ring|Wall|Road|Street|Avenue|Lane) \d+/gu,
    allowed: (m) => STREETS.has(m),
  },
];

export interface Finding {
  file: string;
  line: number;
  what: string;
}

function files(root: string, entry: string): string[] {
  // The catalog's dev server caches its dependencies under catalog/: not ours.
  if (/(^|\/)(node_modules|\.astro)$/.test(entry)) return [];
  const path = join(root, entry);
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return [];
  }
  if (stat.isFile()) return [path];
  return readdirSync(path).flatMap((child) => files(root, join(entry, child)));
}

/** Every file that is or may become public: in a checkout, each file git tracks or would add and
 *  the built type pages; in an installed package, which has no .git, every file it ships. */
function scanned(root: string): string[] {
  if (!existsSync(join(root, ".git"))) return files(root, ".");
  const git = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  if (git.status !== 0) throw new Error(`git ls-files failed in ${root}: ${git.stderr}`);
  const listed = git.stdout
    .split("\0")
    .filter(Boolean)
    .map((f) => join(root, f))
    // A deleted file or a link to a directory (.agents/skills) is no text to read.
    .filter((f) => existsSync(f) && statSync(f).isFile());
  return [...listed, ...files(root, "dist/types")];
}

// Data URIs (faces, logos, the QR code) are base64, where any pattern matches by chance.
const withoutDataUris = (text: string) =>
  text.replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g, "data:");

/** The text rules, and each deny term as a whole word, over every scanned file under `root`. */
export function scanText(root: string, deny: string[] = []): Finding[] {
  const terms = deny.map((term) => ({
    term,
    pattern: new RegExp(
      `(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
      "u",
    ),
  }));
  const findings: Finding[] = [];
  for (const file of scanned(root)) {
    const bytes = readFileSync(file);
    // An image or font: no text, and any pattern matches its bytes by chance.
    if (bytes.includes(0)) continue;
    const lines = withoutDataUris(bytes.toString("utf8")).split("\n");
    lines.forEach((text, i) => {
      for (const rule of RULES)
        for (const [match] of text.matchAll(rule.pattern))
          if (!rule.allowed?.(match))
            findings.push({ file: relative(root, file), line: i + 1, what: rule.what });
      for (const { term, pattern } of terms)
        if (pattern.test(text))
          findings.push({ file: relative(root, file), line: i + 1, what: `the term "${term}"` });
    });
  }
  return findings;
}

/** Each person or client the samples' props name, word by word against the invented names. */
export function scanSamples(data: object = samples): string[] {
  const found: string[] = [];
  const walk = (value: unknown, path: string, key: string) => {
    if (typeof value === "string") {
      if (!PERSON_KEYS.test(key) && !personAt(path, key)) return;
      const named = key === "title" ? value.slice(value.lastIndexOf(": ") + 1) : value;
      const words = named.replace(/[(),]/g, " ").split(/\s+/).filter(Boolean);
      const foreign = words.filter((w) => /^\p{Lu}/u.test(w) && !INVENTED.has(w));
      if (foreign.length > 0) found.push(`${path}: ${foreign.join(" ")}`);
    } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, key));
    else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, k);
  };
  for (const [name, value] of Object.entries(data)) walk(value, name, name);
  return found;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const denyAt = args.indexOf("--deny");
  if (args.includes("--help") || (args.length > 0 && (denyAt !== 0 || args.length !== 2))) {
    console.log("Usage: bun run documents-privacy [--deny <terms.txt>]");
    process.exit(args.includes("--help") ? 0 : 1);
  }
  const deny =
    denyAt === 0
      ? readFileSync(args[1], "utf8")
          .split("\n")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
  const findings = scanText(ROOT, deny);
  const names = scanSamples();
  for (const f of findings) console.error(`${f.file}:${f.line}: ${f.what}`);
  for (const n of names)
    console.error(`scripts/samples.ts ${n}: not an invented name (privacy.ts INVENTED)`);
  if (findings.length + names.length > 0) {
    console.error("documents-privacy: the package carries what may not be public.");
    process.exit(1);
  }
  console.log(`documents-privacy: clean${deny.length ? `, ${deny.length} deny terms` : ""}`);
}
