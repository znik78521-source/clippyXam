const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createKeyVault } = require("./key-vault.cjs");
async function fixture(t, available = true) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "clippy-vault-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const safeStorage = {
    isEncryptionAvailable: () => available,
    encryptString: (text) =>
      Buffer.from([...Buffer.from(text)].map((x) => x ^ 128)),
    decryptString: (bytes) =>
      Buffer.from([...bytes].map((x) => x ^ 128)).toString(),
  };
  return {
    directory,
    safeStorage,
    vault: createKeyVault({ directory, safeStorage, platform: "win32" }),
  };
}
test("key persistence round trip delegates encryption and deletion removes the file", async (t) => {
  const f = await fixture(t);
  await f.vault.save("test-secret");
  const disk = await fs.readFile(path.join(f.directory, "openrouter-key.bin"));
  assert.equal(disk.includes(Buffer.from("test-secret")), false);
  assert.equal((await f.vault.load()).key, "test-secret");
  await f.vault.save("");
  assert.equal((await f.vault.load()).key, "");
});
test("each provider key is encrypted in its own file and cannot overwrite another provider", async (t) => {
  const f = await fixture(t);
  await Promise.all([
    f.vault.save("or-secret", "openrouter"),
    f.vault.save("groq-secret", "groq"),
    f.vault.save("teamo-secret", "teamorouter"),
  ]);
  assert.deepEqual(
    [
      (await f.vault.load("openrouter")).key,
      (await f.vault.load("groq")).key,
      (await f.vault.load("teamorouter")).key,
    ],
    ["or-secret", "groq-secret", "teamo-secret"],
  );
  assert.deepEqual((await fs.readdir(f.directory)).sort(), [
    "groq-key.bin",
    "openrouter-key.bin",
    "teamorouter-key.bin",
  ]);
  assert.throws(() => f.vault.save("x", "unknown"), /Unknown/);
});
test("unavailable encryption never falls back to plaintext", async (t) => {
  const f = await fixture(t, false);
  await assert.rejects(() => f.vault.save("test-secret"), /недоступно/);
  assert.equal((await fs.readdir(f.directory)).length, 0);
  assert.equal((await f.vault.load()).key, "");
});
test("key updates are serialized; another-account decryption failure is recoverable", async (t) => {
  const f = await fixture(t);
  await Promise.all([f.vault.save("first"), f.vault.save("second")]);
  assert.equal((await f.vault.load()).key, "second");
  f.safeStorage.decryptString = () => {
    throw new Error("DPAPI error");
  };
  assert.match((await f.vault.load()).warning, /расшифровать/);
  await f.vault.save("");
  await assert.rejects(() => f.vault.save("x".repeat(513)), /ключ/);
});
