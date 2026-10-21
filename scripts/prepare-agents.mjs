/** Extract upstream resources reproducibly; keep binary assets out of Git. */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

for (const id of ["clippy", "rover", "merlin"]) {
  const source = (await import(`clippyjs/agents/${id}`)).default;
  const [agent, map] = await Promise.all([source.agent(), source.map()]);
  const prefix = "data:image/png;base64,";
  if (typeof map.default !== "string" || !map.default.startsWith(prefix)) {
    throw new Error(`Unexpected sprite format for ${id}`);
  }
  const folder = fileURLToPath(
    new URL(`../public/agents/${id}/`, import.meta.url),
  );
  await mkdir(folder, { recursive: true });
  await Promise.all([
    writeFile(`${folder}/agent.json`, JSON.stringify(agent.default)),
    writeFile(
      `${folder}/map.png`,
      Buffer.from(map.default.slice(prefix.length), "base64"),
    ),
  ]);
}
console.log(
  "Prepared original Clippy, Rover and Merlin resources from ClippyJS.",
);
