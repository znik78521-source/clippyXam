const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  createLocalVoice,
  validFile,
  wavFromPCM,
} = require("./local-voice.cjs");
async function fixture(t, fetchImpl) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "clippy-voice-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "piper.exe"), "test");
  const data = Buffer.from("model");
  const files = [
    {
      name: "model.onnx",
      size: data.length,
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
      url: "https://test.invalid/model",
    },
  ];
  let child,
    calls = 0;
  const states = [];
  const voice = createLocalVoice({
    baseDir: path.join(root, "cache"),
    engineDir: root,
    platform: "win32",
    files,
    fetchImpl:
      fetchImpl ||
      (async () => {
        calls++;
        return new Response(data);
      }),
    changed: (s) => states.push(s),
    spawn: (exe, args, opts) => {
      assert.equal(exe, path.join(root, "piper.exe"));
      assert.ok(args.includes("--output_raw"));
      assert.equal(opts.shell, undefined);
      child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stdin = new EventEmitter();
      child.stdin.end = (text) => {
        child.text = text;
      };
      child.kill = () => {
        child.killed = true;
      };
      return child;
    },
  });
  t.after(() => voice.dispose());
  return {
    voice,
    states,
    get child() {
      return child;
    },
    calls: () => calls,
    root,
  };
}
test("first-run voice is verified, progress reported, and reused without another download", async (t) => {
  const f = await fixture(t);
  await Promise.all([f.voice.prepare(), f.voice.prepare()]);
  assert.equal(f.calls(), 1);
  assert.equal(f.voice.state().phase, "ready");
  assert.equal(f.states.at(-1).progress, 100);
  await f.voice.prepare();
  assert.equal(f.calls(), 1);
});
test("bad downloaded voice is never marked ready or launched", async (t) => {
  const f = await fixture(t, async () => new Response("wrong"));
  await assert.rejects(() => f.voice.prepare(), /сумма/);
  assert.equal(f.voice.state().phase, "error");
  assert.equal(f.child, undefined);
});
test("speech uses stdin, returns a WAV, enforces ownership and rejects invalid input", async (t) => {
  const f = await fixture(t);
  await f.voice.prepare();
  const owner = new EventEmitter();
  const other = new EventEmitter();
  await assert.rejects(() => f.voice.synthesize(owner, "x", 99), /параметры/);
  const p = f.voice.synthesize(owner, "Привет; rm -rf /", 1);
  await new Promise((r) => setImmediate(r));
  assert.match(f.child.text, /Привет; rm -rf/);
  f.voice.stop(other);
  assert.equal(f.child.killed, undefined);
  f.child.stdout.emit("data", Buffer.from([1, 2, 3, 4]));
  f.child.emit("close", 0);
  const wav = await p;
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.length, 48);
  const pending = f.voice.synthesize(owner, "Отмена", 1);
  await new Promise((r) => setImmediate(r));
  owner.emit("destroyed");
  assert.equal(await pending, null);
  assert.equal(f.child.killed, true);
});
test("cancel while downloading prevents late synthesis", async (t) => {
  let release;
  const gate = new Promise((r) => (release = r));
  const f = await fixture(t, async () => {
    await gate;
    return new Response("model");
  });
  const owner = new EventEmitter();
  const pending = f.voice.synthesize(owner, "Привет");
  f.voice.stop(owner);
  assert.equal(await pending, null);
  release();
  await f.voice.prepare();
  assert.equal(f.child, undefined);
});
test("WAV headers and manifest checks do not trust arbitrary bytes", () => {
  assert.equal(wavFromPCM(Buffer.from([1, 2])).readUInt32LE(24), 22050);
  const bytes = Buffer.from("x"),
    gitSha1 = crypto
      .createHash("sha1")
      .update("blob 1\0")
      .update(bytes)
      .digest("hex");
  assert.equal(validFile(bytes, { size: 1, gitSha1 }), true);
  assert.equal(validFile(Buffer.from("y"), { size: 1, gitSha1 }), false);
});
