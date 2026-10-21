const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createDictation } = require("./dictation.cjs");
function setup() {
  const owner = new EventEmitter(),
    child = new EventEmitter();
  child.stdout = new EventEmitter();
  let killed = 0,
    command;
  child.kill = () => {
    killed++;
  };
  const engine = createDictation({
    platform: "win32",
    spawn: (...args) => {
      command = args;
      return child;
    },
  });
  return { owner, child, engine, killed: () => killed, command: () => command };
}
test("dictation is explicit, bounded, fixed-command and never interpolates text", async () => {
  const c = setup();
  const p = c.engine.start(c.owner);
  const args = c.command()[1];
  assert.equal(args[3], "-EncodedCommand");
  assert.match(Buffer.from(args[4], "base64").toString("utf16le"), /ru-RU/);
  c.child.stdout.emit("data", Buffer.from(JSON.stringify({ text: "Привет" })));
  c.child.emit("close", 0);
  assert.equal(await p, "Привет");
  assert.equal(c.killed(), 1);
  assert.equal(c.owner.listenerCount("destroyed"), 0);
});
test("cancel ignores late speech and only the owning renderer can cancel", async () => {
  const c = setup();
  const p = c.engine.start(c.owner);
  c.engine.stop(new EventEmitter());
  assert.equal(c.killed(), 0);
  c.engine.stop(c.owner);
  assert.equal(await p, "");
  c.child.emit("close", 0);
  assert.equal(c.killed(), 1);
});
test("window destruction, duplicate start and missing recognizer are safe", async () => {
  const c = setup();
  const p = c.engine.start(c.owner);
  await assert.rejects(() => c.engine.start(c.owner), /используется/);
  c.owner.emit("destroyed");
  assert.equal(await p, "");
  const next = c.engine.start(c.owner);
  c.child.stdout.emit("data", Buffer.from('{"error":"no-language"}'));
  c.child.emit("close", 0);
  await assert.rejects(() => next, /русский/);
});
test("unsupported platform does not spawn and oversized output aborts", async () => {
  const engine = createDictation({
    platform: "linux",
    spawn: () => assert.fail("spawn"),
  });
  await assert.rejects(() => engine.start(new EventEmitter()), /Windows/);
  const c = setup();
  const p = c.engine.start(c.owner);
  c.child.stdout.emit("data", Buffer.alloc(65537));
  await assert.rejects(() => p, /Ошибка/);
});
