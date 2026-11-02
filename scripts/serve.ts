// `bun run dev`: serves this checkout on 127.0.0.1:4328 for http://documents.localhost, which Caddy
// proxies here as it proxies os.localhost to its dev server. specimen/ is not committed: a request
// for a specimen page writes it afresh with scripts/specimen.ts (about 5 s) when a file outside it
// changed since the last build, so a reload shows the working tree.
import { watch } from "node:fs";
import { join, resolve, sep } from "node:path";

const root = resolve(import.meta.dir, "..");
const home = "/specimen/";

let dirty = true;
let building: Promise<string | undefined> | undefined;
watch(root, { recursive: true }, (_, name) => {
  if (name && !/^(specimen|node_modules|\.git|\.astro)\b/.test(name)) dirty = true;
});

// The specimen as of the working tree; the build's error text when it fails.
function fresh() {
  if (!dirty) return building;
  dirty = false;
  building = (async () => {
    const run = Bun.spawn(["bun", "scripts/specimen.ts"], { cwd: root, stdout: "ignore" });
    const error = await new Response(run.stderr).text();
    if (!(await run.exited)) return undefined;
    dirty = true;
    return error;
  })();
  return building;
}

Bun.serve({
  hostname: "127.0.0.1",
  port: 4328,
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path === "/") return new Response(null, { status: 302, headers: { Location: home } });
    if (path.startsWith(home) && (path.endsWith("/") || path.endsWith(".html"))) {
      const error = await fresh();
      if (error) return new Response(error, { status: 500 });
    }
    const file = join(root, path.endsWith("/") ? `${path}index.html` : path);
    const found = file.startsWith(root + sep) && (await Bun.file(file).exists());
    return found ? new Response(Bun.file(file)) : new Response("Not found", { status: 404 });
  },
});
console.log("Caddy: http://documents.localhost, direct: http://localhost:4328");
