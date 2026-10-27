import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, ".next/server/app");
const required = [
  "node_modules/playwright-core/index.js",
  "node_modules/playwright-core/index.mjs",
  "node_modules/playwright-core/package.json",
  "node_modules/playwright-core/lib/coreBundle.js",
  "node_modules/playwright-core/lib/utilsBundle.js",
  "node_modules/playwright-core/lib/server/deviceDescriptorsSource.json",
  "node_modules/playwright-core/browsers.json",
];

async function traces(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) return traces(file);
        return file.endsWith(".nft.json") ? [file] : [];
      }),
    )
  ).flat();
}

let rendererTraces = 0;
let pdfFound = false;
for (const trace of await traces(appDir)) {
  const { files } = JSON.parse(await readFile(trace, "utf8"));
  const resolved = new Set(
    files.map((file) => path.resolve(path.dirname(trace), file)),
  );
  const isPdfRoute = trace.endsWith(
    "/quotes/[number]/revisions/[revisionNumber]/pdf/route.js.nft.json",
  );
  if (isPdfRoute) pdfFound = true;
  if (!isPdfRoute && !resolved.has(path.join(root, required[0]))) continue;
  rendererTraces++;
  for (const file of required) {
    if (!resolved.has(path.join(root, file))) {
      throw new Error(`${path.relative(root, trace)} does not trace ${file}`);
    }
  }
}
if (!pdfFound || rendererTraces === 0) {
  throw new Error(
    "The PDF route trace was not found; run npm run build first.",
  );
}
console.log(
  `Verified Playwright runtime files in ${rendererTraces} route trace(s).`,
);
