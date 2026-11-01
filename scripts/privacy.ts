#!/usr/bin/env bun
// documents-privacy: fails when the package's data (components, scripts, tests, specimen) carries
// what may not be public. This repo's gate runs the rules below, which need no private data:
// every euro figure a placeholder, every mail address on a reserved example domain or ours, no
// phone number or IBAN, no street address but our imprint's and the invented ones, and every
// person or client in the samples' structured props drawn from the invented names.
// A consumer holding the real names adds them: `bun run documents-privacy --deny <file>`, one
// term per line, scans the installed package for each term as a whole word. The terms stay in
// the consumer: this repo never sees them.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as samples from "./samples";

const ROOT = resolve(import.meta.dir, "..");
const SCANNED = ["components", "scripts", "test", "specimen", "document.css", "README.md"];

const MAIL_DOMAINS = /^(hackersandwizards\.dev|example\.(com|org|net|de))$/i;
const STREETS = new Set(["Osterstraße 95", "Beispielweg 12", "Example Road 12"]);
// Every word a person or client in the samples' props may carry: invented, or our own.
const INVENTED = new Set(
  "Mara Beispiel Jonas Probst Erika Max Mustermann Musterwerk AG Ltd GmbH hackers&wizards Partner".split(
    " ",
  ),
);
// The props naming a person or a client.
const PERSON_KEYS =
  /^(personName|recipientName|recipientFirstName|attendeeName|attendeeCompany|employee|contact|company|client|clientShort)$/;

const RULES: { what: string; pattern: RegExp; allowed?: (match: string) => boolean }[] = [
  { what: "a euro figure that is not a placeholder", pattern: /\d[\d.,]*\s?(€|EUR\b)|€\s?\d/g },
  {
    what: "a mail address outside the example domains and ours",
    pattern: /[\w.+-]+@((?:[\w-]+\.)+[a-z]{2,})/gi,
    allowed: (m) => MAIL_DOMAINS.test(m.split("@")[1]),
  },
  { what: "a phone number", pattern: /(?<!\w)\+\d{2}[\s/-]?\(?0?\d{2,5}\)?[\s/-]?\d{3,}/g },
  { what: "an IBAN", pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z\d]{4}){3,}/g },
  {
    what: "a street address",
    pattern:
      /\b\p{Lu}[\p{L}-]*(?:straße|strasse|str\.|weg|gasse|allee|platz|damm|ring|chaussee)\s+\d+|\b\p{Lu}\p{L}+ (?:Road|Street|Avenue|Lane) \d+/gu,
    allowed: (m) => STREETS.has(m),
  },
];

export interface Finding {
  file: string;
  line: number;
  what: string;
}

function files(root: string, entry: string): string[] {
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
  for (const file of SCANNED.flatMap((entry) => files(root, entry))) {
    const lines = withoutDataUris(readFileSync(file, "utf8")).split("\n");
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
      if (!PERSON_KEYS.test(key) && !(key === "name" && path.includes("signers"))) return;
      const words = value.replace(/[(),]/g, " ").split(/\s+/).filter(Boolean);
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
