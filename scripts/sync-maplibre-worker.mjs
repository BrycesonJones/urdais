/**
 * Copies MapLibre's worker module (and the shared module it imports) from the
 * installed package into public/vendor so the browser can load them from our
 * own origin. MapLibre resolves its worker relative to `import.meta.url`,
 * which points inside a bundled chunk under Next, so it must be told where
 * the worker lives (see setWorkerUrl in src/components/map/urdais-map.tsx).
 * Runs before `next dev` and `next build`; the output is ignored by git and
 * always matches the installed maplibre-gl version.
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const distDir = path.dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
const { version } = JSON.parse(await readFile(path.join(distDir, "..", "package.json"), "utf8"));
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "vendor", "maplibre-gl");

await mkdir(outDir, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(path.join(distDir, file), path.join(outDir, file));
}
console.log(`maplibre-gl ${version}: worker modules synced to public/vendor/maplibre-gl`);
