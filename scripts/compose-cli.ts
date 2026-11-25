#!/usr/bin/env bun
import { readFileSync, writeFileSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { composePage, openComposer } from "./compose";
import { isRecord } from "./root";

const USAGE = `Usage: bun run documents-compose <Component> <props.json> <output.html>

Renders a document component of @hackersandwizards/documents (components/, such as DocRateCard
or DocLeistungsnachweis) with the props in the JSON file to a standalone HTML document: the document base baked in, each component's
scoped styles after it. A string prop "title" becomes the document's title. Runs Astro's compiler
of the project in the current directory.`;

/** `--serve`: composes each request read from stdin, one JSON line `{ id, name, props }`, and
 * answers on fd 3 with `{ id, html }` or `{ id, error }`, keeping a composer per component, so
 * each page is the one a fresh run writes (a composer's styles are those of every component it
 * rendered). composeWarmDocument keeps this process. */
async function serve() {
  const composers = new Map<string, ReturnType<typeof openComposer>>();
  // Its stdin closes with the caller, however that ends.
  const lines = createInterface({ input: process.stdin });
  lines.on("close", () => process.exit(0));
  for await (const line of lines) {
    let id: unknown;
    let answer: object;
    try {
      const request: unknown = JSON.parse(line);
      if (!isRecord(request)) throw new Error("Expected a compose request object");
      id = request.id;
      const { name, props } = request;
      if (typeof name !== "string" || !/^Doc\w+$/.test(name))
        throw new Error(`Not a document component: ${String(name)}`);
      if (!isRecord(props)) throw new Error("Expected a document props object");
      // A composer that failed to open is opened again on the next call, not kept failing.
      if (!composers.has(name))
        composers.set(
          name,
          openComposer().catch((error) => {
            composers.delete(name);
            throw error;
          }),
        );
      answer = { id, html: await composePage(await composers.get(name)!, name, props) };
    } catch (error) {
      answer = { id, error: (error as Error).stack ?? String(error) };
    }
    writeSync(3, `${JSON.stringify(answer)}\n`);
  }
}

if (import.meta.main && process.argv[2] === "--serve") await serve();
else if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(USAGE);
    process.exit(0);
  }
  const [name, propsPath, output] = args;
  if (args.length !== 3 || !/^Doc\w+$/.test(name)) {
    console.error(USAGE);
    process.exit(1);
  }
  // The props first: a missing or broken file fails before Vite boots.
  const props: unknown = JSON.parse(readFileSync(resolve(propsPath), "utf8"));
  if (!isRecord(props)) throw new Error("Expected a document props object");
  const composer = await openComposer();
  try {
    writeFileSync(resolve(output), await composePage(composer, name, props));
    console.log(resolve(output));
  } finally {
    await composer.close();
  }
}
