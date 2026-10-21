import { createHash } from "node:crypto";
const result = [];
for (const id of ["clippy", "rover", "merlin"]) {
  const source = (await import(`clippyjs/agents/${id}`)).default;
  const data = (await source.agent()).default;
  const png = Buffer.from((await source.map()).default.split(",")[1], "base64");
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  let frames = 0,
    layers = 0;
  for (const [name, animation] of Object.entries(data.animations)) {
    for (const [index, frame] of animation.frames.entries()) {
      frames++;
      if (!Number.isFinite(frame.duration) || frame.duration < 0)
        throw new Error(`${id}/${name}/${index}: invalid duration`);
      for (const [x, y] of frame.images || []) {
        layers++;
        if (
          x < 0 ||
          y < 0 ||
          x + data.framesize[0] > width ||
          y + data.framesize[1] > height
        )
          throw new Error(`${id}/${name}/${index}: out-of-sheet layer`);
      }
    }
  }
  result.push({
    id,
    source: "clippyjs@0.1.0",
    width,
    height,
    animations: Object.keys(data.animations).length,
    frames,
    layers,
    sha256: createHash("sha256").update(png).digest("hex"),
    artworkRights:
      "Microsoft / respective owners; not covered by code MIT licence",
  });
}
console.log(
  JSON.stringify(
    {
      available: result,
      blocked: ["courtney", "earl"],
      note: "Blocked characters have no verified resource pack in this project. No substituted images.",
    },
    null,
    2,
  ),
);
